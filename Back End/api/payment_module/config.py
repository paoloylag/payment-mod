from functools import lru_cache
from typing import Literal

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import make_url


class Settings(BaseSettings):
    app_name: str = "Payment Module API"
    app_version: str = "0.1.0"
    app_env: Literal["local", "test", "staging", "production"] = "local"
    api_prefix: str = "/api/v1"
    log_level: str = "INFO"
    notification_app_url: str = "https://payment.life.edu.ph"
    email_delivery_enabled: bool = False
    email_transport: Literal["disabled", "smtp"] = "disabled"
    email_from_address: str = ""
    email_from_name: str = "Payment Module"
    smtp_host: str = ""
    smtp_port: int = Field(default=587, ge=1, le=65535)
    smtp_security: Literal["starttls", "tls"] = "starttls"
    smtp_username: str | None = None
    smtp_password: SecretStr | None = None
    smtp_timeout_seconds: int = Field(default=15, ge=1, le=120)

    database_url: str = "postgresql+psycopg://payment_module:payment_module@127.0.0.1:5434/payment_module"
    database_timezone: str = "Asia/Manila"
    cors_origins: str = (
        "http://127.0.0.1:5175,http://localhost:5175,"
        "http://127.0.0.1:5176,http://localhost:5176"
    )
    session_cookie_name: str = "aps_session"
    session_idle_minutes: int = 60
    session_absolute_hours: int = 8
    session_cookie_secure: bool = False
    trusted_hosts: str = "localhost,127.0.0.1,testserver"
    session_cleanup_enabled: bool = False
    session_cleanup_retention_days: int = 30
    session_cleanup_batch_size: int = 1000
    draft_archival_enabled: bool = False
    draft_retention_days: int = 90
    draft_warning_days: int = 7
    draft_archival_batch_size: int = 500
    development_demo_password: str | None = None
    s3_endpoint_url: str | None = None
    s3_region: str = "ap-southeast-1"
    s3_bucket: str = "payment-module-documents"
    s3_access_key_id: str | None = None
    s3_secret_access_key: str | None = None
    s3_server_side_encryption: str = "AES256"
    document_max_file_mb: int = 50
    document_max_request_mb: int = 100

    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore", hide_input_in_errors=True,
    )

    @model_validator(mode="after")
    def validate_email(self):
        from email.headerregistry import Address

        if bool(self.smtp_username) != bool(self.smtp_password and self.smtp_password.get_secret_value()):
            raise ValueError("SMTP username and password must be configured together")
        if "\r" in self.email_from_name or "\n" in self.email_from_name:
            raise ValueError("Email sender name must be a single line")
        if self.email_delivery_enabled:
            if self.email_transport != "smtp" or not self.smtp_host.strip():
                raise ValueError("Enabled email requires the SMTP transport and host")
            if any(character.isspace() for character in self.smtp_host) or "://" in self.smtp_host:
                raise ValueError("SMTP host must be a hostname, without a scheme or whitespace")
            if self.app_env in {"staging", "production"}:
                from urllib.parse import urlsplit

                application = urlsplit(self.notification_app_url)
                if (application.scheme != "https" or not application.hostname or application.username
                        or application.password or application.query or application.fragment):
                    raise ValueError("Deployed email requires an HTTPS application URL")

            try:
                address = Address(addr_spec=self.email_from_address)
                if not address.username or not address.domain:
                    raise ValueError("Missing sender domain")
            except (ValueError, TypeError) as error:
                raise ValueError("Configure a single email sender address") from error
        return self

    @model_validator(mode="after")
    def validate_deployment(self):
        if self.app_env not in {"staging", "production"}:
            return self
        if not self.session_cookie_secure or self.development_demo_password:
            raise ValueError("Deployed environments require secure cookies and disabled demo credentials")
        hosts = [host.strip() for host in self.trusted_hosts.split(",") if host.strip()]
        if not hosts or any(host in {"*", "localhost", "127.0.0.1", "testserver"} or "*" in host for host in hosts):
            raise ValueError("Configure explicit deployment TRUSTED_HOSTS")
        from urllib.parse import urlsplit

        for origin in self.cors_origin_list:
            parsed = urlsplit(origin)
            if (parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password
                    or parsed.path or parsed.query or parsed.fragment or "*" in origin
                    or parsed.hostname in {"localhost", "127.0.0.1"}):
                raise ValueError("Deployment CORS origins must be explicit HTTPS origins")
        database = make_url(self.database_url)
        if (database.get_backend_name() != "postgresql" or database.password == "payment_module"
                or database.host in {None, "localhost", "127.0.0.1", "db"}
                or database.query.get("sslmode") not in {"verify-full", "verify-ca"}):
            raise ValueError("Deployment database requires a remote PostgreSQL host and verified TLS")
        if self.s3_endpoint_url or self.s3_access_key_id or self.s3_secret_access_key:
            raise ValueError("Deployment S3 uses AWS workload identity and the standard AWS endpoint")
        if self.s3_server_side_encryption not in {"AES256", "aws:kms"} or not self.s3_bucket:
            raise ValueError("Deployment document storage requires a bucket and server-side encryption")
        return self

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
