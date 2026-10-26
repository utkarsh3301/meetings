import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const EXPIRES = 15 * 60;
let client: S3Client | undefined;

function s3() {
  client ??= new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
    // Default checksums get baked into presigned URLs and break browser PUTs to R2.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  return client;
}

const Bucket = () => process.env.R2_BUCKET!;

export const presignPut = (Key: string, ContentType: string) =>
  getSignedUrl(s3(), new PutObjectCommand({ Bucket: Bucket(), Key, ContentType }), { expiresIn: EXPIRES });

export const presignGet = (Key: string) =>
  getSignedUrl(s3(), new GetObjectCommand({ Bucket: Bucket(), Key }), { expiresIn: EXPIRES });

export const deleteObject = (Key: string) => s3().send(new DeleteObjectCommand({ Bucket: Bucket(), Key }));
