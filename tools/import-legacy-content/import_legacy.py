"""将旧库正文转换为带本地图片的静态富文本；不读取数据库凭据。"""
import argparse
import html
import json
import re
import shutil
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit

TAGS = {'section', 'div', 'p', 'span', 'strong', 'b', 'em', 'i', 'u', 's', 'br', 'hr', 'img', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption', 'colgroup', 'col', 'sup', 'sub'}
BLOCKED = {'script', 'style', 'iframe', 'object', 'embed', 'form', 'svg', 'math', 'video', 'audio'}
VOID = {'br', 'hr', 'img', 'col'}
CSS = {'color', 'background-color', 'font-size', 'font-family', 'font-weight', 'font-style', 'text-align', 'text-decoration', 'line-height', 'letter-spacing', 'word-break', 'overflow-wrap', 'white-space', 'vertical-align', 'width', 'max-width', 'min-width', 'height', 'max-height', 'min-height', 'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'border', 'border-top', 'border-right', 'border-bottom', 'border-left', 'border-width', 'border-style', 'border-color', 'border-radius', 'box-sizing', 'display', 'flex-direction', 'justify-content', 'align-items', 'gap', 'float', 'clear'}


def local_image(value):
    parsed = urlsplit(value)
    if parsed.scheme or parsed.netloc:
        return None
    path = unquote(parsed.path).replace('\\', '/')
    if path.startswith('./'):
        path = path[2:]
    path = path.lstrip('/')
    if not path.startswith('res/') or '..' in path.split('/') or Path(path).suffix.lower() not in {'.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.bmp'}:
        return None
    return path


def clean_style(value):
    output = []
    for rule in value.split(';'):
        key, sep, val = rule.partition(':')
        key, val = key.strip().lower(), val.strip()
        if sep and key in CSS and val and not re.search(r'url\s*\(|expression|javascript|@import|[{}\\<>]|/\*', val, re.I):
            output.append(f'{key}:{val}')
    return ';'.join(output)


class RichParser(HTMLParser):
    def __init__(self, assets):
        super().__init__(convert_charrefs=True)
        self.assets = assets
        self.output = []
        self.blocked = []

    def handle_starttag(self, tag, attrs):
        if self.blocked:
            if tag in BLOCKED:
                self.blocked.append(tag)
            return
        if tag in BLOCKED:
            self.blocked.append(tag)
            return
        if tag not in TAGS:
            return
        attrs = dict(attrs)
        safe = {}
        if tag == 'img':
            src = self.assets.get(local_image(attrs.get('src', '')))
            if not src:
                return
            safe.update(src=src, alt=attrs.get('alt') or '旧站原文配图', loading='lazy', decoding='async')
        if tag == 'a':
            href = attrs.get('href', '')
            if href.startswith(('https://', 'http://', '#')) or (href.startswith('/') and not href.startswith('//')):
                safe['href'] = href
                safe['rel'] = 'noopener noreferrer'
        style = clean_style(attrs.get('style', ''))
        if style:
            safe['style'] = style
        for name in ('width', 'height', 'colspan', 'rowspan', 'border'):
            val = attrs.get(name, '')
            if re.fullmatch(r'\d{1,4}%?', val):
                safe[name] = val
        rendered = ''.join(f' {key}="{html.escape(value, quote=True)}"' for key, value in safe.items())
        self.output.append(f'<{tag}{rendered}>')

    def handle_endtag(self, tag):
        if self.blocked:
            if tag == self.blocked[-1]:
                self.blocked.pop()
            return
        if tag in TAGS and tag not in VOID:
            self.output.append(f'</{tag}>')

    def handle_data(self, data):
        if not self.blocked:
            self.output.append(html.escape(data, quote=False))


def clean_html(value, assets):
    parser = RichParser(assets)
    parser.feed(value)
    parser.close()
    return ''.join(parser.output)


def main():
    args = argparse.ArgumentParser()
    args.add_argument('--input', required=True)
    args.add_argument('--source-root', required=True)
    args.add_argument('--output-root', required=True)
    options = args.parse_args()
    source_root = Path(options.source_root).resolve()
    output_root = Path(options.output_root).resolve()
    rows = json.loads(Path(options.input).read_text(encoding='utf-8-sig'))
    result = {}
    copied = set()
    for row in rows:
        assets = {}
        for src in re.findall(r'<img\b[^>]*\bsrc=[\"\']([^\"\']+)', row['content'], re.I):
            key = local_image(html.unescape(src))
            if not key:
                continue
            source = (source_root / key).resolve()
            if not source.is_relative_to(source_root) or not source.is_file():
                raise ValueError(f'配图不存在或路径越界：{key}')
            target = output_root / 'public/images/legacy' / key
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, target)
            copied.add(key)
            assets[key] = '/images/legacy/' + key
        result[str(row['id'])] = {'html': clean_html(row['content'], assets), 'images': list(assets.values())}
    destination = output_root / 'app/data/legacy/rich-content.json'
    destination.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'已整理 {len(result)} 篇富文本、{len(copied)} 张独立配图。')


if __name__ == '__main__':
    main()
