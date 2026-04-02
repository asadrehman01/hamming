# Mobile View Setup

To view your site on your phone while it's running locally, follow these steps:

## 1. Expose the Local Server
Vite (the tool running your project) blocks external access by default. You need to tell it to listen on all network interfaces.

Stop your current `npm run dev` and restart it with the `--host` flag:
```bash
npm run dev -- --host
```
> [!NOTE]
> The extra `--` is required to pass the `--host` argument directly to the underlying Vite command.

## 2. Find Your Local IP Address
Find your local IP address using the commands below:

- macOS/Linux: `ifconfig` or `ip addr`
- Windows: `ipconfig`

Use the IPv4 address from your active local network adapter.

## 3. Access on Your Phone
1. Ensure your phone and computer are on the **same Wi-Fi network**.
2. Open the browser on your phone.
3. Type the following address (replace with your machine's local IP):
   **`http://<your-computer-ip>:5173`**

## Troubleshooting
- **Firewall**: If it doesn't load, your Windows Firewall might be blocking port `5173`. You may need to create an "Inbound Rule" for it or temporarily disable the firewall to test.
- **Port**: If Vite picked a different port (e.g., `5174`), use that number instead.
