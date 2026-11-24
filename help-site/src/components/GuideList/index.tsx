// Cards for every guide, grouped by category. The list (src/guides.json) is kept up to date by
// `npm run docs` in the tutorial-kit folder.
import React from 'react';
import Link from '@docusaurus/Link';
import guides from '@site/src/guides.json';

type Guide = {title: string; description: string; category: string; path: string};

export default function GuideList(): React.ReactNode {
  const list = guides as Guide[];
  if (!list.length) {
    return (
      <p>
        No guides yet. Record one and add it with <code>npm run docs -- &lt;name&gt;</code>.
      </p>
    );
  }
  const groups = [...new Set(list.map((g) => g.category))];
  return (
    <>
      {groups.map((cat) => (
        <section key={cat} style={{marginBottom: 24}}>
          <h2>{cat}</h2>
          <div className="tk-guide-grid">
            {list
              .filter((g) => g.category === cat)
              .map((g) => (
                <Link key={g.path} to={g.path} className="tk-guide-card">
                  <strong>{g.title}</strong>
                  {g.description && <span>{g.description}</span>}
                </Link>
              ))}
          </div>
        </section>
      ))}
    </>
  );
}
