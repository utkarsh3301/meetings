import os
from functools import cache

import boto3
from botocore.config import Config


@cache
def _s3():
    return boto3.client(
        "s3",
        endpoint_url=f"https://{os.environ['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com",
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
        config=Config(request_checksum_calculation="when_required", response_checksum_validation="when_required"),
    )


def bucket() -> str:
    return os.environ["R2_BUCKET"]


def download(key: str, path: str) -> None:
    _s3().download_file(bucket(), key, path)


def upload(path: str, key: str, content_type: str) -> None:
    _s3().upload_file(path, bucket(), key, ExtraArgs={"ContentType": content_type})


def delete(key: str) -> None:
    _s3().delete_object(Bucket=bucket(), Key=key)
