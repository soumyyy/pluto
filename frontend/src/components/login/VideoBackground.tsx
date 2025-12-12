'use client';

interface VideoBackgroundProps {
  videoSrc?: string;
  poster?: string;
}

export function VideoBackground({
  videoSrc = 'https://cdn.coverr.co/videos/coverr-flying-through-space-9991/1080p.mp4',
  poster
}: VideoBackgroundProps) {
  return (
    <div className="login-video-wrapper">
      <video
        className="login-video"
        autoPlay
        muted
        loop
        playsInline
        poster={poster}
        preload="metadata"
      >
        <source src={videoSrc} type="video/mp4" />
      </video>
      <div className="login-video-overlay" />
      <div className="login-video-gradient" />
    </div>
  );
}
