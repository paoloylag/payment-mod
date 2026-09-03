from cryptography.fernet import Fernet, InvalidToken

from .config import get_settings


def _fernet() -> Fernet:
    key = get_settings().bank_encryption_key
    if not key:
        raise RuntimeError("BANK_ENCRYPTION_KEY is required for protected bank-account operations")
    return Fernet(key.encode())


def encrypt_account_number(value: str) -> str:
    return _fernet().encrypt(value.strip().encode()).decode()


def decrypt_account_number(value: str) -> str:
    try:
        return _fernet().decrypt(value.encode()).decode()
    except InvalidToken as error:
        raise RuntimeError("Unable to decrypt bank account with the configured key") from error
