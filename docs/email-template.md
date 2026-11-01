# Magic Link email template

Paste this into Supabase so sign-in emails include both the 6-digit code and the link.

**Where:** Supabase Dashboard → Authentication → Emails → Templates → **Magic Link**.

**Subject:**

```
Your Boxing Buddies sign-in code
```

**Body:** paste the HTML below into the message body. Leave `{{ .Token }}` and `{{ .ConfirmationURL }}` exactly as written. Supabase fills those in when it sends the email.

The app expects a **6-digit** code (Supabase's default). Do not change the OTP length.

This file is only the template. It has not been applied to the project. After you paste it, send yourself a test email from the app.

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Your Boxing Buddies sign-in code</title>
</head>
<body style="margin:0;padding:0;background:#110F0E;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#110F0E;margin:0;padding:0;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#1C1917;border-radius:16px;">
          <tr>
            <td style="height:6px;background:#D62828;border-radius:16px 16px 0 0;font-size:0;line-height:0;">&nbsp;</td>
          </tr>
          <tr>
            <td style="padding:32px 28px 8px;font-family:Georgia,'Times New Roman',serif;font-size:13px;letter-spacing:.18em;text-transform:uppercase;color:#D62828;">
              Boxing Buddies
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 0;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:28px;line-height:1.2;font-weight:700;color:#F6F0E7;">
              Your sign-in code
            </td>
          </tr>
          <tr>
            <td style="padding:12px 28px 0;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.5;color:#A8A199;">
              Enter this code in the Boxing Buddies app. On an iPhone home screen, the button below opens Safari, so the code is how you get back into the app.
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:28px 28px 8px;">
              <div style="display:inline-block;padding:16px 28px;background:#110F0E;border-radius:12px;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:36px;line-height:1;font-weight:700;letter-spacing:.28em;color:#F6F0E7;">
                {{ .Token }}
              </div>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:8px 28px 4px;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:13px;line-height:1.4;color:#A8A199;">
              This code expires soon. If you did not ask to sign in, you can ignore this email.
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:24px 28px 8px;">
              <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:14px 22px;background:#D62828;border-radius:12px;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;">
                Sign in with the link
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 32px;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:13px;line-height:1.5;color:#A8A199;">
              The link works in a normal browser tab. If the button does not work, paste this address into your browser:<br>
              <span style="color:#F6F0E7;word-break:break-all;">{{ .ConfirmationURL }}</span>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
```
