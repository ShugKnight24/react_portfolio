import { FC } from "react";
import { Post as PostProps } from "../../types/feed";
import { YoutubeEmbed } from "./YoutubeEmbed";

export const Post: FC<{ post: PostProps }> = ({ post }) => (
  <div key={post.id} className="post">
    {post.title && <h3>{post.title}</h3>}
    {post.artist && <p>{post.artist}</p>}
    {post.content && post.content.split('\n').map((line, index) => (
      (line !== '' && line.trim() !== '') && <p key={index}>{line}</p>
    ))}
    {post.youtubeInfo && (
      <YoutubeEmbed
        title={post.title}
        videoId={post.youtubeInfo.videoId}
        youtubeLink={post.youtubeInfo.videoLink}
      />
    )}
    <hr />
  </div>
);
