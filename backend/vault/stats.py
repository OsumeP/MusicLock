"""
Estadísticas personales (día 19; Estadísticas FR-02 a FR-05), calculadas a partir
del historial de reproducciones del propio usuario (`ListeningHistory`).

- Los periodos son días de calendario en la zona horaria del proyecto: "7 días"
  = hoy y los 6 anteriores. Así el total coincide con la suma de las barras diarias.
- El tiempo escuchado es una aproximación: cada reproducción cuenta la duración
  completa de la canción (no se registra cuánto se escuchó realmente).
- Solo hay canciones propias: las compartidas conmigo no van al historial (I97).
  Las tendencias globales de la plataforma (FR-07) quedan en el backlog: mostrarían
  títulos de canciones privadas de otros usuarios.
"""

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta

from django.db.models import BooleanField, Case, Count, Max, Sum, Value, When
from django.db.models.functions import TruncDate
from django.utils import timezone

from accounts.models import User

from .models import ListeningHistory
from .services import own_songs

PERIOD_DAYS = {"7d": 7, "30d": 30, "all": None}
TOP_SONGS = {"7d": 10, "30d": 10, "all": 50}  # "Todo el tiempo" = reproducciones totales por canción (FR-05)
TOP_ARTISTS = 5


class InvalidPeriod(Exception):
    pass


@dataclass(frozen=True)
class ListeningStats:
    period: str
    since: date | None
    total_plays: int
    listening_seconds: int
    distinct_songs: int
    top_songs: list[dict]  # [{"song": Song anotada, "plays": n}]
    top_artists: list[dict]
    daily: list[dict]


def listening_stats(user: User, period: str = "7d") -> ListeningStats:
    if period not in PERIOD_DAYS:
        raise InvalidPeriod(period)
    days = PERIOD_DAYS[period]

    plays = ListeningHistory.objects.filter(user=user, song__owner=user)
    since = None
    if days is not None:
        today = timezone.localdate()
        since = today - timedelta(days=days - 1)
        start = timezone.make_aware(datetime.combine(since, time.min), timezone.get_current_timezone())
        plays = plays.filter(played_at__gte=start)

    totals = plays.aggregate(plays=Count("id"), seconds=Sum("song__duration"), songs=Count("song", distinct=True))

    # Top canciones: más reproducciones; a igualdad, la escuchada más recientemente.
    ranking = list(
        plays.values("song")
        .annotate(n=Count("id"), last=Max("played_at"))
        .order_by("-n", "-last")[: TOP_SONGS[period]]
    )
    songs = own_songs(user).in_bulk([row["song"] for row in ranking])
    top_songs = [{"song": songs[row["song"]], "plays": row["n"]} for row in ranking if row["song"] in songs]

    top_artists = [
        {"artist": row["song__artist"], "plays": row["plays"], "listening_seconds": row["seconds"] or 0, "songs": row["songs"]}
        for row in plays.values("song__artist")
        .annotate(
            plays=Count("id"),
            seconds=Sum("song__duration"),
            songs=Count("song", distinct=True),
            # A igualdad de reproducciones, las canciones sin artista van al final.
            unknown=Case(When(song__artist="", then=Value(True)), default=Value(False), output_field=BooleanField()),
        )
        .order_by("-plays", "unknown", "song__artist")[:TOP_ARTISTS]
    ]

    daily = []
    if since is not None:
        per_day = {
            row["day"]: row["n"]
            for row in plays.annotate(day=TruncDate("played_at", tzinfo=timezone.get_current_timezone()))
            .order_by()
            .values("day")
            .annotate(n=Count("id"))
        }
        daily = [{"date": since + timedelta(days=i), "plays": per_day.get(since + timedelta(days=i), 0)} for i in range(days)]

    return ListeningStats(
        period=period,
        since=since,
        total_plays=totals["plays"],
        listening_seconds=totals["seconds"] or 0,
        distinct_songs=totals["songs"],
        top_songs=top_songs,
        top_artists=top_artists,
        daily=daily,
    )
