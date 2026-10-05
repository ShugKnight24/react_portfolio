import { FC, useMemo, useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { postsArray } from '../../data/feedData';
import { FeedPost, FeedProps } from '../../types/feed';
import { BookPost } from './BookPost';
import { MusicPost } from './MusicPost';
import { Post } from './Post';
import {
  FeedStudio,
  FeedCustomizationState,
  loadFeedCustomization,
  saveFeedCustomization,
  DEFAULT_FEED_CUSTOMIZATION,
  THEMES,
  LAYOUTS,
  TYPOGRAPHIES,
} from './FeedStudio';
import { sound } from '../arcade/audio/audioSynth';
import styles from './Feed.module.css';

// SVG Icons
const Icons = {
  stream: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="18" x2="16" y2="18" />
    </svg>
  ),
  music: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </svg>
  ),
  quote: (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 17h3l2-4V7H5v6h3zm8 0h3l2-4V7h-6v6h3z" />
    </svg>
  ),
  lightbulb: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 18h6" />
      <path d="M10 22h4" />
      <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14" />
    </svg>
  ),
  video: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polygon points="23 7 16 12 23 17 23 7" />
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
    </svg>
  ),
  rss: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 11a9 9 0 0 1 9 9" />
      <path d="M4 4a16 16 0 0 1 16 16" />
      <circle cx="5" cy="19" r="1" />
    </svg>
  ),
  search: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  ),
  close: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  arrow: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  ),
};

const filterCategories = [
  { id: 'all', label: 'All', icon: Icons.stream },
  { id: 'music', label: 'Music', icon: Icons.music },
  { id: 'quotes', label: 'Quotes', icon: Icons.quote },
  { id: 'thoughts', label: 'Thoughts', icon: Icons.lightbulb },
  { id: 'video', label: 'Videos', icon: Icons.video },
];

const getPostType = (post: FeedPost): string => {
  if ('author' in post && 'book' in post) return 'quotes';
  if ('song' in post || 'artist' in post) return 'music';
  if ('youtubeInfo' in post && post.youtubeInfo) return 'video';
  return 'thoughts';
};

const LIKES_KEY = 'portfolio_feed_likes_v1';
const REBLOGS_KEY = 'portfolio_feed_reblogs_v1';

export const Feed: FC<FeedProps> = ({ truncate }) => {
  const [posts] = useState<FeedPost[]>(postsArray);
  const [activeFilter, setActiveFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);

  // Customization state
  const [customization, setCustomization] = useState<FeedCustomizationState>(
    loadFeedCustomization
  );

  // Likes & Reblogs state
  const [likedPosts, setLikedPosts] = useState<Record<number, boolean>>(() => {
    try {
      const saved = localStorage.getItem(LIKES_KEY);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const [likeCounts, setLikeCounts] = useState<Record<number, number>>({});
  const [reblogCounts, setReblogCounts] = useState<Record<number, number>>({});

  // Toast feedback state
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (msg: string) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToastMessage(msg);
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 2400);
  };

  // Sparkles Particle animation on mouse movement
  useEffect(() => {
    if (!customization.sparklesEnabled || truncate) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    let lastSparkleTime = 0;
    const handleMouseMove = (e: MouseEvent) => {
      const now = Date.now();
      if (now - lastSparkleTime < 80) return; // Throttle to 80ms
      lastSparkleTime = now;

      const sparkle = document.createElement('div');
      sparkle.className = styles.sparkleParticle;
      sparkle.style.left = `${e.clientX}px`;
      sparkle.style.top = `${e.clientY}px`;
      sparkle.style.setProperty('--dx', `${(Math.random() - 0.5) * 40}px`);
      sparkle.style.setProperty('--dy', `${(Math.random() - 0.5) * 40}px`);

      document.body.appendChild(sparkle);
      setTimeout(() => {
        sparkle.remove();
      }, 600);
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [customization.sparklesEnabled, truncate]);

  // Handle Like
  const handleToggleLike = (id: number) => {
    sound.playCoin();
    setLikedPosts((prev) => {
      const isCurrentlyLiked = !!prev[id];
      const next = { ...prev, [id]: !isCurrentlyLiked };
      try {
        localStorage.setItem(LIKES_KEY, JSON.stringify(next));
      } catch (e) {
        console.error(e);
      }
      return next;
    });

    setLikeCounts((prev) => {
      const base = prev[id] || (id * 3) % 47 + 12;
      const isCurrentlyLiked = !!likedPosts[id];
      return { ...prev, [id]: isCurrentlyLiked ? base - 1 : base + 1 };
    });
  };

  // Handle Reblog
  const handleReblog = (id: number) => {
    sound.playPowerUp();
    setReblogCounts((prev) => {
      const base = prev[id] || (id * 2) % 23 + 4;
      return { ...prev, [id]: base + 1 };
    });
    showToast('Reblogged to your queue');
  };

  // Handle Share / Copy Link
  const handleShare = (id: number) => {
    sound.playBeep();
    const url = `${window.location.origin}${window.location.pathname}#post-${id}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).catch(() => {});
    }
    showToast('Link copied to clipboard');
  };

  // Handle Tag Selection
  const handleSelectTag = (tag: string) => {
    sound.playBeep();
    setActiveTag(tag);
  };

  // Filter posts based on category, search, and tag
  const filteredPosts = useMemo(() => {
    return posts.filter((post) => {
      // Category filter
      if (activeFilter !== 'all' && getPostType(post) !== activeFilter) {
        return false;
      }

      // Tag filter
      if (activeTag) {
        const query = activeTag.toLowerCase();
        const tagHaystack = [
          post.title,
          post.content,
          'artist' in post ? post.artist : '',
          'song' in post ? (post as any).song : '',
          'author' in post ? (post as any).author : '',
          'book' in post ? (post as any).book : '',
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        if (!tagHaystack.includes(query)) return false;
      }

      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const searchableFields = [
          post.title,
          post.content,
          'artist' in post ? post.artist : '',
          'song' in post ? (post as any).song : '',
          'author' in post ? (post as any).author : '',
          'book' in post ? (post as any).book : '',
        ];
        return searchableFields.some((field) => field?.toLowerCase().includes(query));
      }

      return true;
    });
  }, [posts, activeFilter, activeTag, searchQuery]);

  const displayedPosts = truncate ? filteredPosts.slice(0, truncate) : filteredPosts;

  // Stats for the feed
  const stats = useMemo(() => {
    const musicPosts = posts.filter((p) => getPostType(p) === 'music').length;
    const quotePosts = posts.filter((p) => getPostType(p) === 'quotes').length;
    const videoPosts = posts.filter((p) => getPostType(p) === 'video').length;
    return { total: posts.length, music: musicPosts, quotes: quotePosts, videos: videoPosts };
  }, [posts]);

  const renderPost = (post: FeedPost) => {
    const isLiked = !!likedPosts[post.id];
    const likeCount = likeCounts[post.id] || (post.id * 3) % 47 + 12 + (isLiked ? 1 : 0);
    const reblogCount = reblogCounts[post.id] || (post.id * 2) % 23 + 4;

    const commonProps = {
      isLiked,
      likeCount,
      reblogCount,
      onToggleLike: handleToggleLike,
      onReblog: handleReblog,
      onShare: handleShare,
      onSelectTag: handleSelectTag,
    };

    if ('author' in post && 'book' in post) {
      return <BookPost key={post.id} post={post} {...commonProps} />;
    } else if ('albumArt' in post || 'song' in post) {
      return <MusicPost key={post.id} post={post} {...commonProps} />;
    } else {
      return <Post key={post.id} post={post} {...commonProps} />;
    }
  };

  // Minimal version for homepage embedding
  if (truncate) {
    return (
      <div className="feed-minimal">
        <div className="feed-posts-minimal">{displayedPosts.map((post) => renderPost(post))}</div>
        {posts.length > truncate && (
          <Link to="/feed" className="feed-view-more">
            <span>View All {posts.length} Posts</span>
            <span className="arrow-icon">{Icons.arrow}</span>
          </Link>
        )}
      </div>
    );
  }

  // Get layout class
  const getLayoutClass = () => {
    switch (customization.layout) {
      case 'masonry':
        return styles.layoutMasonry;
      case 'scrapbook':
        return styles.layoutScrapbook;
      case 'compact':
        return styles.layoutCompact;
      case 'stream':
      default:
        return styles.layoutStream;
    }
  };

  return (
    <div
      className={styles.feedPage}
      data-theme={customization.theme}
      data-typography={customization.typography}
      data-pattern={customization.pattern}
    >
      {/* 90s Geocities Marquee Banner */}
      {customization.theme === 'geocities' && (
        <div className={styles.geocitiesMarquee}>
          <span>
            ★ ★ ★ WELCOME TO SHUGMI'S CYBERSPHERE ★ BEST VIEWED AT 1024x768 ★ NETSCAPE COMMUNICATOR READY ★ VISITOR #049281 ★ ★ ★
          </span>
        </div>
      )}

      {/* Page intro: title and subtitle are customizable in the studio */}
      <header className={styles.feedHero}>
        <p className={styles.heroKicker}>Liber II &middot; The Commonplace Book</p>
        <h1 className={`world-title ${styles.heroTitle}`}>{customization.blogTitle}</h1>
        <div className="cx-rule" aria-hidden="true">
          <span />
        </div>
        <p className={styles.heroSubtitle}>{customization.blogSubtitle}</p>

        <div className={styles.feedStats}>
          <div className={styles.statItem}>
            <span className={styles.statNumber}>{stats.total}</span>
            <span className={styles.statLabel}>Entries</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statNumber}>{stats.music}</span>
            <span className={styles.statLabel}>Tracks</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statNumber}>{stats.quotes}</span>
            <span className={styles.statLabel}>Quotes</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statNumber}>{stats.videos}</span>
            <span className={styles.statLabel}>Videos</span>
          </div>
        </div>
      </header>

      {/* Prominent Tumblr-Style Blog Customization Toolbar */}
      <section className={styles.feedCustomizerBar}>
        <div className={styles.customizerHeaderRow}>
          <div className={styles.customizerTitleGroup}>
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
            <span className={styles.customizerTitle}>Customize the feed</span>
          </div>
          <span className={styles.customizerSub}>Themes, layouts, typography, and cursor effects, saved in this browser</span>
        </div>

        <div className={styles.customizerControlsRow}>
          {/* Theme Quick Switcher */}
          <div className={styles.customizerControlGroup}>
            <span className={styles.controlGroupLabel}>Theme</span>
            <div className={styles.customizerPills}>
              {THEMES.map((theme) => (
                <button
                  key={theme.id}
                  type="button"
                  className={`${styles.customizerPill} ${customization.theme === theme.id ? styles.active : ''}`}
                  aria-pressed={customization.theme === theme.id}
                  onClick={() => {
                    sound.playBeep(520, 0.04);
                    const updated = { ...customization, theme: theme.id };
                    setCustomization(updated);
                    saveFeedCustomization(updated);
                    showToast(`Theme: ${theme.name}`);
                  }}
                  title={`Apply ${theme.name} theme`}
                >
                  <span className={styles.pillDot} style={{ background: theme.accent }} />
                  <span>{theme.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Layout Selector */}
          <div className={styles.customizerControlGroup}>
            <span className={styles.controlGroupLabel}>Layout</span>
            <div className={styles.customizerPills}>
              {LAYOUTS.map((layout) => (
                <button
                  key={layout.id}
                  type="button"
                  className={`${styles.customizerPill} ${customization.layout === layout.id ? styles.active : ''}`}
                  aria-pressed={customization.layout === layout.id}
                  onClick={() => {
                    sound.playBeep(440, 0.04);
                    const updated = { ...customization, layout: layout.id };
                    setCustomization(updated);
                    saveFeedCustomization(updated);
                    showToast(`Layout: ${layout.label}`);
                  }}
                  title={`Switch to ${layout.label} layout`}
                >
                  <span>{layout.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Typography Selector */}
          <div className={styles.customizerControlGroup}>
            <span className={styles.controlGroupLabel}>Font</span>
            <div className={styles.customizerPills}>
              {TYPOGRAPHIES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`${styles.customizerPill} ${customization.typography === t.id ? styles.active : ''}`}
                  aria-pressed={customization.typography === t.id}
                  onClick={() => {
                    sound.playBeep(480, 0.04);
                    const updated = { ...customization, typography: t.id };
                    setCustomization(updated);
                    saveFeedCustomization(updated);
                    showToast(`Typography: ${t.label}`);
                  }}
                  title={`Set typography to ${t.label}`}
                >
                  <span>{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Sparkles & Reset Toggle */}
          <div className={styles.customizerActions}>
            <button
              type="button"
              className={`${styles.customizerActionBtn} ${customization.sparklesEnabled ? styles.activeSparkle : ''}`}
              onClick={() => {
                sound.playPowerUp();
                const next = !customization.sparklesEnabled;
                const updated = { ...customization, sparklesEnabled: next };
                setCustomization(updated);
                saveFeedCustomization(updated);
                showToast(next ? 'Cursor sparkles on' : 'Cursor sparkles off');
              }}
              title="Toggle retro cursor sparkle particles"
            >
              <span>{customization.sparklesEnabled ? 'Sparkles on' : 'Sparkles off'}</span>
            </button>

            <button
              type="button"
              className={styles.customizerResetBtn}
              onClick={() => {
                sound.playCoin();
                setCustomization(DEFAULT_FEED_CUSTOMIZATION);
                saveFeedCustomization(DEFAULT_FEED_CUSTOMIZATION);
                showToast('Reset to default feed style');
              }}
              title="Reset feed customizations"
            >
              <span>Reset</span>
            </button>
          </div>
        </div>
      </section>

      {/* Filters & Search Controls */}
      <section className={styles.feedControls}>
        <div className={styles.filtersRow}>
          {/* Post Type Category Pills */}
          <div className={styles.categoryFilters}>
            {filterCategories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                className={`${styles.filterBtn} ${activeFilter === cat.id ? styles.active : ''}`}
                aria-pressed={activeFilter === cat.id}
                onClick={() => {
                  sound.playBeep();
                  setActiveFilter(cat.id);
                }}
              >
                <span>{cat.icon}</span>
                <span>{cat.label}</span>
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div className={styles.controlsRight}>
            <div className={styles.searchBox}>
              {Icons.search}
              <input
                type="text"
                placeholder="Search notes, lyrics, tags"
                aria-label="Search the feed"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button
                  type="button"
                  className={styles.searchClear}
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search"
                >
                  {Icons.close}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Active Tag Banner */}
        {activeTag && (
          <div className={styles.tagFilterBanner}>
            <span>Filtering by tag <strong>#{activeTag}</strong></span>
            <button
              type="button"
              className={styles.clearTagBtn}
              onClick={() => {
                sound.playBeep();
                setActiveTag(null);
              }}
            >
              Clear tag filter
            </button>
          </div>
        )}
      </section>

      {/* Posts River */}
      <section>
        {displayedPosts.length === 0 ? (
          <div className={styles.emptyState}>
            <h3 className={styles.emptyTitle}>No entries match</h3>
            <p>Try clearing your search or tag filter.</p>
            <button
              type="button"
              className={styles.emptyBtn}
              onClick={() => {
                sound.playCoin();
                setActiveFilter('all');
                setSearchQuery('');
                setActiveTag(null);
              }}
            >
              Reset filters
            </button>
          </div>
        ) : (
          <div className={`${styles.postsContainer} ${getLayoutClass()}`}>
            {displayedPosts.map((post) => (
              <div key={post.id} id={`post-${post.id}`} className={styles.postWrapper}>
                {renderPost(post)}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Toast Feedback */}
      {toastMessage && (
        <div className={styles.feedToast} role="status">
          {toastMessage}
        </div>
      )}

      {/* Blog Studio Customization Drawer & Floating Quick Switcher */}
      <FeedStudio
        customization={customization}
        onChange={setCustomization}
        onToast={showToast}
      />
    </div>
  );
};

export default Feed;
