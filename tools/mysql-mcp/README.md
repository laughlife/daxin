# daxin 本地 MySQL MCP

仅提供列出表、查看字段、读取有限行三个工具，固定连接 127.0.0.1:3306/daxin。使用 MySQL 客户端与官方 MCP Python SDK；不接受任意 SQL，事务只读，最多读取 100 行。当前按用户配置使用 root，尚未创建新数据库账号。

## 本机输入密码

在 PowerShell 执行以下命令，按提示输入 MySQL 密码（不要发送到聊天）：

```powershell
& 'C:\Environment\mysql-8.4.9\bin\mysql_config_editor.exe' set --login-path=daxin --host=127.0.0.1 --port=3306 --user=root --password
```

登录信息由 mysql_config_editor 保存在 Windows 用户配置中（混淆存储，不是保险库），不写入本项目。不要提交凭据文件。此命令不修改数据库密码。

## 安装与运行

```powershell
python -m venv tools/mysql-mcp/.venv
tools/mysql-mcp/.venv/Scripts/python.exe -m pip install -r tools/mysql-mcp/requirements.txt
tools/mysql-mcp/.venv/Scripts/python.exe tools/mysql-mcp/server.py
```

Codex 注册使用绝对路径，服务名 daxin-mysql。新增配置后重新连接或重启 Codex，使工具加载。数据库工具错误不等于 MCP 服务启动失败；凭据设置后需实际运行 list_tables 验证连接。

参考：[Codex MCP 配置](https://developers.openai.com/codex/mcp/)、[官方 Python SDK](https://github.com/modelcontextprotocol/python-sdk)。
