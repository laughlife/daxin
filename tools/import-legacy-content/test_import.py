import unittest
from import_legacy import clean_html


class RichContentTests(unittest.TestCase):
    def test_preserves_layout_and_local_images(self):
        html = '<section><p style="text-align:center;color:rgb(255,0,0)"><strong>案件</strong></p><img src="res/a.png" width="100%"></section>'
        result = clean_html(html, {'res/a.png': '/images/legacy/res/a.png'})
        self.assertIn('<strong>案件</strong>', result)
        self.assertIn('text-align:center', result)
        self.assertIn('color:rgb(255,0,0)', result)
        self.assertIn('src="/images/legacy/res/a.png"', result)

    def test_removes_executable_markup(self):
        result = clean_html('<script>alert(1)</script><p onclick="bad()">正文</p><iframe src="x"></iframe><a href="javascript:bad()">链接</a>', {})
        for forbidden in ('script', 'alert', 'onclick', 'iframe', 'javascript:'):
            self.assertNotIn(forbidden, result)
        self.assertIn('正文', result)

    def test_rejects_external_images_and_css_urls(self):
        result = clean_html('<img src="https://other.example/x.png"><p style="background:url(x);position:fixed;color:red">正文</p>', {})
        self.assertNotIn('<img', result)
        self.assertNotIn('url(', result)
        self.assertNotIn('position:', result)
        self.assertIn('color:red', result)

    def test_preserves_tables_and_escapes_text(self):
        result = clean_html('<table><tr><td colspan="2">A &amp; B</td></tr></table>', {})
        self.assertIn('<table>', result)
        self.assertIn('colspan="2"', result)
        self.assertIn('A &amp; B', result)


if __name__ == '__main__':
    unittest.main()
