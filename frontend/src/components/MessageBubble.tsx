interface Source {
  title: string;
  url: string;
  snippet: string;
}

interface MessageBubbleProps {
  role: 'user' | 'assistant';
  content: string;
  sources?: Source[];
  thoughts?: string[];
  webSearchUsed?: boolean;
}

export function MessageBubble({ role, content, sources, thoughts, webSearchUsed }: MessageBubbleProps) {
  const isUser = role === 'user';
  const containerClass = `message-row ${isUser ? 'user' : 'assistant'}`;
  const bubbleClass = `message-bubble ${isUser ? 'user' : 'assistant'}`;
  return (
    <div className={containerClass}>
      <div className={bubbleClass}>
        <p className="message-text">{content}</p>
        {/* <span className="message-label">{isUser ? 'USER' : 'PLUTO'}</span> */}
        {!isUser && sources && sources.length > 0 && (
          <div className="source-list">
            <div className="source-title">Sources</div>
            <div className="source-pill-container">
              {sources.slice(0, 4).map((source) => {
                const shortTitle =
                  source.title.length > 40 ? `${source.title.slice(0, 37)}…` : source.title;
                return (
                  <a
                    key={source.url + source.title}
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                    className="source-pill"
                  >
                    {shortTitle}
                  </a>
                );
              })}
            </div>
            {/* {webSearchUsed && <div className="sources-note">* web</div>} */}
          </div>
        )}
      </div>
    </div>
  );
}
