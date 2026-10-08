import unittest
from unittest.mock import patch
from types import SimpleNamespace
import server

class ReadOnlyTests(unittest.TestCase):
    def test_reject_injection_and_cross_schema(self):
        for name in ["daxin.users", "users`; DROP TABLE users", "", "x" * 65]:
            with self.assertRaises(ValueError): server.identifier(name)
    def test_reject_unbounded_reads(self):
        for limit, offset in [(0,0),(101,0),(20,-1),(20,100001)]:
            with self.assertRaises(ValueError): server.read_rows("users",limit,offset)
    def test_fixed_database_readonly_and_xml(self):
        xml = '<resultset xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><row><field name="title">测试</field><field name="optional" xsi:nil="true"/></row></resultset>'
        with patch("server.subprocess.run",return_value=SimpleNamespace(returncode=0,stdout=xml)) as run:
            self.assertEqual(server.read_rows("users"),[{"title":"测试","optional":None}])
            args=run.call_args.args[0]
            self.assertIn("--database=daxin",args)
            self.assertIn("START TRANSACTION READ ONLY",args[-1])
            self.assertIn("`daxin`.`users` LIMIT 20",args[-1])
            self.assertNotIn("--password", " ".join(args))
    def test_auth_error_redacted(self):
        with patch("server.subprocess.run",return_value=SimpleNamespace(returncode=1,stdout="",stderr="private")):
            with self.assertRaisesRegex(RuntimeError,"MySQL") as error: server.list_tables()
            self.assertNotIn("private",str(error.exception))

if __name__=="__main__": unittest.main()
