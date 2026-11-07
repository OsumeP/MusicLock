from django.urls import path

from . import views

urlpatterns = [
    path("auth/prelogin", views.PreloginView.as_view(), name="auth-prelogin"),
    path("auth/register", views.RegisterView.as_view(), name="auth-register"),
    path("auth/login", views.LoginView.as_view(), name="auth-login"),
    path("auth/refresh", views.RefreshView.as_view(), name="auth-refresh"),
    path("auth/logout", views.LogoutView.as_view(), name="auth-logout"),
    path("me", views.MeView.as_view(), name="me"),
    path("me/vault", views.KeyMaterialView.as_view(), name="me-vault"),
    path("me/password", views.ChangePasswordView.as_view(), name="me-password"),
]
