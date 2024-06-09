import { FC } from "react";
import { YoutubeEmbedProps } from "../../types/feed";

export const YoutubeEmbed: FC<YoutubeEmbedProps> = ({  title, videoId, youtubeLink }) => {
  return (
    <>
      <iframe
        src={`https://www.youtube.com/embed/${videoId}`}
        title={title ? title : 'YouTube Video Embed'}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
      <a
        href={youtubeLink}
        target="_blank"
        rel="noreferrer"
      >
        Watch on YouTube
      </a>
    </>
  );
}