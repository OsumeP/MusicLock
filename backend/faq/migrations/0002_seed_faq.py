from django.db import migrations

INITIAL_FAQS = [
    (1, "¿Qué es MusicLock?", "Es una plataforma donde tu música se cifra en tu navegador antes "
    "de subirse y la llave nunca sale de tu dispositivo. El servidor guarda datos cifrados que no puede abrir."),
    (2, "¿Que pasa si olvido mi contraseña?", "Tu contraseña es la única llave de tu bóveda: si la olvidas, "
    "tus archivos no se pueden recuperar. Por eso al registrarte te pedimos confirmar que lo entiendes. "),
    (3, "¿Qué formatos puedo subir?", "Solo MP3, de hasta 20 MB en el plan Free."),
    (4, "¿Puedo compartir canciones?", "Puedes compartir tus canciones cifradas a amigos de la red."),    
    (5, "¿El título de mis canciones también se cifra?", "El título y el artista que escribes se guardan "
    "sin cifrar para poder buscarlos. El audio y las etiquetas internas del archivo sí viajan y se guardan cifrados."),        
]

def seed(apps, schema_editor):
    FAQ = apps.get_model("faq", "FAQ")
    for order, question, answer in INITIAL_FAQS:
        FAQ.objects.get_or_create(question=question, defaults={"answer": answer, "order": order})

class Migration(migrations.Migration):
    dependencies = [("faq", "0001_initial")]
    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]