"""按旧库栏目和文章内容归类；保留已导入案例，生成统一正文输入。"""
import json
import re
from datetime import datetime, timezone, timedelta
from pathlib import Path

from html import unescape

ROOT = Path(__file__).resolve().parents[2]
TEMP = ROOT / 'tmp/legacy-preview'

def plain(value):
    return re.sub(r'\s+', ' ', unescape(re.sub(r'<[^>]+>', ' ', value))).strip()

def main():
    metadata = {str(row['id']): row for row in json.loads((TEMP / 'article-metadata.json').read_text(encoding='utf-8'))}
    extra = json.loads((TEMP / 'expanded-input.json').read_text(encoding='utf-8'))
    destination = ROOT / 'web/app/data/legacy/articles.json'
    articles = json.loads(destination.read_text(encoding='utf-8'))
    known = {str(row['source']['articleId']) for row in articles}
    bodies = {str(row['id']): row for row in json.loads((TEMP / 'import-input.json').read_text(encoding='utf-8-sig'))}
    guides = {'191', '252', '290', '336'}
    for row in extra:
        key = str(row['id'])
        meta = metadata[key]
        project = str(meta['project_id'])
        if project == '10':
            section = '/tro/guides' if key in guides else '/tro/success-cases'
            table = 'cn_list_5'
        elif project == '11':
            section, table = '/domestic/labor-disputes', 'cn_list_6'
        elif key == '11':
            section, table = '/tro/news', 'cn_list_1'
        elif key == '8':
            section, table = '/domestic/cross-border-news', 'cn_list_1'
        elif key == '156':
            section, table = '/faq/tro', 'cn_list_4'
        else:
            continue
        bodies[key] = row
        if key in known:
            continue
        text = plain(row.get('note') or row['content'])
        title = meta['title'].strip()
        category = {'/tro/guides': '科普干货', '/tro/success-cases': 'TRO 成功案例', '/domestic/labor-disputes': '劳动纠纷', '/tro/news': '热点资讯', '/domestic/cross-border-news': '跨境资讯', '/faq/tro': 'TRO 常见问题'}[section]
        articles.append({'id': 'legacy-article-' + key, 'category': category, 'title': title, 'excerpt': text[:150] + ('…' if len(text) > 150 else ''), 'publishedAt': datetime.fromtimestamp(int(meta['dateline']), timezone(timedelta(hours=8))).date().isoformat(), 'isFeatured': False, 'href': section + '/legacy-' + key, 'imageSrc': None, 'imageAlt': '', 'sectionPath': section, 'body': [], 'relatedCaseSlugs': [], 'keywords': title + ' ' + text, 'source': {'articleId': int(key), 'table': table, 'title': meta['title']}})
    destination.write_text(json.dumps(articles, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    (TEMP / 'all-content-input.json').write_text(json.dumps(list(bodies.values()), ensure_ascii=False), encoding='utf-8')
    print(f'文章目录 {len(articles)} 篇，正文 {len(bodies)} 篇')

if __name__ == '__main__':
    main()

