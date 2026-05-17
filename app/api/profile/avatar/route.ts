import { createAuthenticatedRouteClient } from "@/lib/server/auth";
import { jsonError, jsonSuccess } from "@/lib/server/http";
import { toProfileResponse, updateUserProfile } from "@/lib/server/profile";
import { createAdminClient } from "@/utils/supabase/admin";

const AVATAR_BUCKET = "profile_pictures";
const AVATAR_SIZE_PX = 128;
const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const PNG_SIGNATURE = "89504e470d0a1a0a";

export async function POST(request: Request): Promise<Response> {
  try {
    const { user } = await createAuthenticatedRouteClient(
      request,
      "app/api/profile/avatar/route.ts",
    );

    if (!user) {
      return jsonError("You must be signed in to update your avatar.", 401);
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return jsonError("Avatar file is required.", 400);
    }

    if (file.type !== "image/png") {
      return jsonError("Avatar must be a PNG image.", 400);
    }

    if (file.size <= 0 || file.size > AVATAR_MAX_BYTES) {
      return jsonError("Avatar must be a non-empty PNG under 2 MB.", 400);
    }

    const storagePath = `${user.id}/avatar.png`;
    const admin = createAdminClient();
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const imageSize = readPngSize(fileBuffer);

    if (!imageSize) {
      return jsonError("Avatar must be a valid PNG image.", 400);
    }

    if (
      imageSize.width !== AVATAR_SIZE_PX ||
      imageSize.height !== AVATAR_SIZE_PX
    ) {
      return jsonError("Avatar PNG must be exactly 128x128 pixels.", 400);
    }

    const { error: uploadError } = await admin.storage
      .from(AVATAR_BUCKET)
      .upload(storagePath, fileBuffer, {
        upsert: true,
        contentType: "image/png",
        cacheControl: "3600",
      });

    if (uploadError) {
      throw new Error(`Failed to upload avatar: ${uploadError.message}`);
    }

    const { data } = admin.storage.from(AVATAR_BUCKET).getPublicUrl(storagePath);
    const avatarUrl = `${data.publicUrl}?v=${Date.now()}`;
    const profile = await updateUserProfile(admin, user, { avatarUrl });

    return jsonSuccess(toProfileResponse(profile));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to upload avatar.";
    return jsonError(message, 500);
  }
}

function readPngSize(buffer: Buffer) {
  if (buffer.length < 24) {
    return null;
  }

  if (buffer.subarray(0, 8).toString("hex") !== PNG_SIGNATURE) {
    return null;
  }

  const chunkType = buffer.subarray(12, 16).toString("ascii");
  if (chunkType !== "IHDR") {
    return null;
  }

  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}
