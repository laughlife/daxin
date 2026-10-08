"""仅向 MCP 暴露 daxin 的固定只读操作；凭据由 mysql login-path 保存。"""
import os
import re
import subprocess
import xml.etree.ElementTree as ET
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("daxin-mysql")
MYSQL = os.environ.get("DAXIN_MYSQL_CLIENT", r"C:\Environment\mysql-8.4.9\bin\mysql.exe")


def identifier(table: str) -> str:
    if not re.fullmatch(r"[A-Za-z0-9_]{1,64}", table):
        raise ValueError("表名只能包含英文字母、数字和下划线，长度不超过 64。")
    return f"`{table}`"


def run_read(sql: str) -> list[dict]:
    # 不接受任意 SQL，只执行下方工具生成的语句；数据库与主机固定。
    result = subprocess.run([
        MYSQL, "--login-path=daxin", "--host=127.0.0.1", "--port=3306",
        "--user=root", "--database=daxin", "--connect-timeout=5",
        "--default-character-set=utf8mb4", "--xml",
        "--execute=START TRANSACTION READ ONLY; " + sql + "; ROLLBACK;"
    ], capture_output=True, timeout=15, encoding="utf-8", errors="replace")
    if result.returncode:
        raise RuntimeError("MySQL 连接或查询失败。请确认 daxin 登录配置、密码、数据库及表名；服务不回显凭据。")
    if len(result.stdout) > 1_000_000:
        raise ValueError("结果超过 1MB，请缩小 limit。")
    root = ET.fromstring(result.stdout)
    rows = []
    for row in root.findall("row"):
        rows.append({field.attrib["name"]: None if field.attrib.get("{http://www.w3.org/2001/XMLSchema-instance}nil") == "true" else (field.text or "") for field in row.findall("field")})
    return rows


@mcp.tool(annotations={"readOnlyHint": True, "destructiveHint": False, "openWorldHint": False})
def list_tables() -> list[dict]:
    """列出本地 daxin 数据库的表与视图，不返回其他数据库。"""
    return run_read("SELECT TABLE_NAME, TABLE_TYPE FROM information_schema.TABLES WHERE TABLE_SCHEMA = 'daxin' ORDER BY TABLE_NAME")


@mcp.tool(annotations={"readOnlyHint": True, "destructiveHint": False, "openWorldHint": False})
def describe_table(table: str) -> list[dict]:
    """读取 daxin 指定表的字段、类型、是否可空和键。"""
    identifier(table)
    return run_read(f"SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_KEY FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'daxin' AND TABLE_NAME = '{table}' ORDER BY ORDINAL_POSITION")


@mcp.tool(annotations={"readOnlyHint": True, "destructiveHint": False, "openWorldHint": False})
def read_rows(table: str, limit: int = 20, offset: int = 0) -> list[dict]:
    """读取 daxin 指定表的有限行；最多 100 行，偏移最多 100000，无固定排序。"""
    name = identifier(table)
    if not 1 <= limit <= 100 or not 0 <= offset <= 100000:
        raise ValueError("limit 范围为 1–100，offset 范围为 0–100000。")
    return run_read(f"SELECT /*+ MAX_EXECUTION_TIME(5000) */ * FROM `daxin`.{name} LIMIT {limit} OFFSET {offset}")


if __name__ == "__main__":
    mcp.run(transport="stdio")
