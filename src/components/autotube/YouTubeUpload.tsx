"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Upload, Youtube, Check, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import type { Scene } from "@/lib/autotube/types";

interface Props {
  scenes: Scene[];
  videoTitle: string;
  nicheName?: string;
  mp4BlobUrl?: string | null;
}

export default function YouTubeUpload({
  scenes,
  videoTitle,
  nicheName,
  mp4BlobUrl,
}: Props) {
  const [connected, setConnected] = useState(false);
  const [channelTitle, setChannelTitle] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadedVideoId, setUploadedVideoId] = useState<string | null>(null);

  // Check YouTube connection status
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/youtube/status");
        const data = await res.json();
        setConnected(data.connected);
        setChannelTitle(data.channelTitle);
      } catch {
        // Not connected
      }
    })();
  }, []);

  // Check for OAuth callback URL params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("youtube_connected") === "true") {
      toast.success("YouTube connected successfully!");
      // Refresh status
      fetch("/api/youtube/status")
        .then((r) => r.json())
        .then((d) => {
          setConnected(d.connected);
          setChannelTitle(d.channelTitle);
        });
      // Clean URL
      window.history.replaceState({}, "", window.location.pathname);
    }
    if (params.get("youtube_error")) {
      toast.error("YouTube connection failed: " + params.get("youtube_error"));
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const handleConnect = () => {
    window.location.href = "/api/youtube/auth";
  };

  const handleUpload = async () => {
    if (!mp4BlobUrl) {
      toast.error("No MP4 file found. Export the MP4 first.");
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    setUploadedVideoId(null);

    try {
      // Fetch the MP4 Blob from the blob URL (created by ExportMp4Button)
      const blobRes = await fetch(mp4BlobUrl);
      const mp4Blob = await blobRes.blob();

      if (mp4Blob.size === 0) {
        throw new Error("MP4 blob is empty — export may have failed");
      }
      // Step 1: Get the access token
      const tokenRes = await fetch("/api/youtube/token");
      const tokenData = await tokenRes.json();

      if (!tokenData.connected) {
        toast.error("YouTube not connected. Click 'Connect YouTube' first.");
        setUploading(false);
        return;
      }

      const accessToken = tokenData.accessToken;

      // Step 2: Build video metadata
      const description = scenes
        .map((s, i) => `${i + 1}. ${s.heading}\n${s.narration}`)
        .join("\n\n");

      const tags = [
        nicheName ?? "faceless",
        "documentary",
        "AI",
        "automation",
        nicheName?.split(" ")[0] ?? "",
      ].filter(Boolean);

      const metadata = {
        snippet: {
          title: videoTitle.substring(0, 100), // YouTube max 100 chars
          description: description.substring(0, 5000), // YouTube max 5000 chars
          tags: tags.slice(0, 10), // YouTube max 10 tags
          categoryId: "27", // Education category
        },
        status: {
          privacyStatus: "private", // Upload as private, user publishes manually
        },
      };

      // Step 3: Start resumable upload session
      const startRes = await fetch(
        "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            "X-Upload-Content-Type": "video/mp4",
            "X-Upload-Content-Length": String(mp4Blob.size),
          },
          body: JSON.stringify(metadata),
        }
      );

      if (!startRes.ok) {
        const errBody = await startRes.text();
        throw new Error(`Upload session failed: ${startRes.status} - ${errBody.substring(0, 200)}`);
      }

      // Get the upload URL from the Location header
      const uploadUrl = startRes.headers.get("location");
      if (!uploadUrl) {
        throw new Error("No upload URL in response headers");
      }

      setUploadProgress(10);
      toast.info("Upload session started. Uploading MP4...");

      // Step 4: Upload the MP4 in one shot (for files under ~50MB)
      // For larger files, we'd chunk with Content-Range headers
      const CHUNK_SIZE = 8 * 1024 * 1024; // 8MB chunks
      const totalSize = mp4Blob.size;
      let uploadedBytes = 0;
      let videoId: string | null = null;

      while (uploadedBytes < totalSize) {
        const chunkEnd = Math.min(uploadedBytes + CHUNK_SIZE, totalSize);
        const chunk = mp4Blob.slice(uploadedBytes, chunkEnd);
        const isLast = chunkEnd === totalSize;

        const chunkRes = await fetch(uploadUrl, {
          method: "PUT",
          headers: {
            "Content-Type": "video/mp4",
            "Content-Range": `bytes ${uploadedBytes}-${chunkEnd - 1}/${totalSize}`,
          },
          body: chunk,
        });

        if (chunkRes.status === 200 || chunkRes.status === 201) {
          // Upload complete — response contains video data
          const videoData = await chunkRes.json();
          videoId = videoData.id;
          uploadedBytes = totalSize;
          setUploadProgress(100);
        } else if (chunkRes.status === 308) {
          // Partial upload — check how much was received
          const range = chunkRes.headers.get("range");
          if (range) {
            const match = range.match(/bytes=(\d+)-(\d+)/);
            if (match) {
              uploadedBytes = parseInt(match[2], 10) + 1;
            }
          } else {
            uploadedBytes = chunkEnd;
          }
          setUploadProgress(10 + Math.round((uploadedBytes / totalSize) * 85));
        } else {
          // Error
          const errBody = await chunkRes.text();
          throw new Error(`Upload chunk failed: ${chunkRes.status} - ${errBody.substring(0, 200)}`);
        }
      }

      if (videoId) {
        setUploadedVideoId(videoId);
        toast.success("Video uploaded to YouTube!", {
          description: `https://youtube.com/watch?v=${videoId}`,
          duration: 10000,
        });
      } else {
        throw new Error("Upload completed but no video ID returned");
      }
    } catch (err) {
      console.error("YouTube upload failed", err);
      const msg = (err as Error).message;
      if (msg.includes("401") || msg.includes("unauthorized")) {
        toast.error("YouTube authorization expired. Reconnect your account.");
        setConnected(false);
      } else {
        toast.error(`Upload failed: ${msg.substring(0, 150)}`, { duration: 8000 });
      }
    } finally {
      setUploading(false);
    }
  };

  if (!connected) {
    return (
      <div className="space-y-2">
        <Button
          onClick={handleConnect}
          size="sm"
          className="bg-red-600 hover:bg-red-500 text-white"
        >
          <Youtube className="size-4 mr-2" />
          Connect YouTube
        </Button>
        <p className="text-[10px] text-muted-foreground">
          Connect your YouTube channel to upload videos directly from the studio.
          Uses OAuth 2.0 — your password is never shared.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs text-emerald-300">
        <Check className="size-3" />
        Connected as <strong>{channelTitle}</strong>
      </div>

      {uploadedVideoId ? (
        <div className="p-3 rounded-md bg-emerald-500/10 border border-emerald-500/30">
          <div className="flex items-center gap-2 mb-2">
            <Check className="size-4 text-emerald-300" />
            <span className="text-sm font-medium text-emerald-300">
              Uploaded to YouTube
            </span>
          </div>
          <div className="space-y-1">
            <a
              href={`https://www.youtube.com/watch?v=${uploadedVideoId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-emerald-200 underline hover:text-emerald-100 block"
            >
              https://www.youtube.com/watch?v={uploadedVideoId}
            </a>
            <a
              href="https://studio.youtube.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-amber-300 underline hover:text-amber-200 block"
            >
              → Go to YouTube Studio to set thumbnail, description & publish
            </a>
          </div>
          <p className="text-[10px] text-muted-foreground mt-2">
            Uploaded as "private". Change visibility to Public or Unlisted in
            YouTube Studio to make the link work.
          </p>
        </div>
      ) : (
        <Button
          onClick={handleUpload}
          disabled={uploading || !mp4BlobUrl}
          size="sm"
          className="bg-red-600 hover:bg-red-500 text-white"
        >
          {uploading ? (
            <>
              <Loader2 className="size-4 mr-2 animate-spin" />
              Uploading... {uploadProgress}%
            </>
          ) : (
            <>
              <Upload className="size-4 mr-2" />
              Upload to YouTube
            </>
          )}
        </Button>
      )}

      {!mp4BlobUrl && !uploading && (
        <p className="text-[10px] text-muted-foreground flex items-start gap-1">
          <AlertCircle className="size-3 flex-shrink-0 mt-0.5" />
          <span>Export the MP4 first (button above), then upload to YouTube.</span>
        </p>
      )}
    </div>
  );
}
