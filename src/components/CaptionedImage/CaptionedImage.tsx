import { FC } from 'react';

import { CaptionedImageProps } from '../../types/captionedImage';

export const CaptionedImage: FC<CaptionedImageProps> = ({ src, alt, caption, link, className }) => (
  <div className={`image-container ${className}`}>
    <figure>
      <img src={src} alt={alt} />
      <figcaption>
        {link ? (
          <a href={link} rel="noopener noreferrer" target="_blank">
            {caption}
          </a>
        ) : (
          caption
        )}
      </figcaption>
    </figure>
  </div>
);
