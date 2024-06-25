import { FC } from 'react';
import { MusicPost as MusicPostProps } from '../../types/feed';
import { YoutubeEmbed } from './YoutubeEmbed';

export const MusicPost: FC<{ post: MusicPostProps }> = ({ post }) => (
  <div key={post.id} className="post music-post">
    <h3>{post.title}</h3>
    {post.content &&
      post.content
        .split('\n')
        .map((line, index) => line !== '' && line.trim() !== '' && <p key={index}>{line}</p>)}
    {post.artist && <p>{post.artist}</p>}
    {post.song && <p>{post.song}</p>}
    {post.albumArt && <img className="album-art" src={post.albumArt} alt={post.album} />}
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
