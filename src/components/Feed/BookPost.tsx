import { FC } from "react";
import { BookPost as BookPostProps } from "../../types/feed";

export const BookPost: FC<{ post: BookPostProps }> = ({ post }) => (
  <div key={post.id} className="post book-post">
    <h3>{post.title}</h3>
    {post.blockquote && <p>{post.blockquote}</p>}
    {post.author && <p>{post.author}</p>}
    {post.book && <p>{post.book}</p>}
    <hr />
  </div>
);
