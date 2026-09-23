from functools import lru_cache

import boto3

from .config import get_settings


class S3Storage:
    def __init__(self):
        settings = get_settings()
        self.bucket = settings.s3_bucket
        self.encryption = settings.s3_server_side_encryption
        self.client = boto3.client(
            "s3",
            endpoint_url=settings.s3_endpoint_url,
            region_name=settings.s3_region,
            aws_access_key_id=settings.s3_access_key_id,
            aws_secret_access_key=settings.s3_secret_access_key,
        )

    def put(self, key: str, fileobj, media_type: str, checksum: str) -> str | None:
        args = {"ContentType": media_type, "Metadata": {"sha256": checksum}}
        if self.encryption:
            args["ServerSideEncryption"] = self.encryption
        response = self.client.put_object(Bucket=self.bucket, Key=key, Body=fileobj, **args)
        return response.get("VersionId")

    def open(self, key: str, version_id: str | None = None):
        kwargs = {"Bucket": self.bucket, "Key": key}
        if version_id:
            kwargs["VersionId"] = version_id
        return self.client.get_object(**kwargs)["Body"]

    def delete(self, key: str, version_id: str | None = None) -> None:
        kwargs = {"Bucket": self.bucket, "Key": key}
        if version_id:
            kwargs["VersionId"] = version_id
        self.client.delete_object(**kwargs)


@lru_cache
def get_storage() -> S3Storage:
    return S3Storage()
