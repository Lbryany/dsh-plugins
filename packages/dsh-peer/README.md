# dsh-peer

Discovery and messaging between dsh sessions on the same machine. Each root session (across processes and profiles, or within one process) is a peer. The plugin adds the `peer_list`, `peer_send` and `peer_rename` tools and the `/peers` and `/peer-name` commands. Messages are delivered one-way and asynchronously, arriving as relay user messages. The registry lives in `$XDG_RUNTIME_DIR/dsh-peer`; cross-process transport uses Unix sockets authenticated with per-process 0600 tokens. See [README.zh.md](README.zh.md) for the full documentation (Chinese).
