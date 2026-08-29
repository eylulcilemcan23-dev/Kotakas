using System.Security.Cryptography;
using System.Text;
using Kotakas.Web.Api;
using Kotakas.Web.Data;
using Kotakas.Web.Models;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace Kotakas.Web.Services;

public sealed class SessionSecurityMiddleware(RequestDelegate next)
{
    public const string DeviceCookie = "kotakas.device";

    public async Task InvokeAsync(HttpContext context, AppDbContext db)
    {
        if (context.User.Identity?.IsAuthenticated != true)
        {
            await next(context);
            return;
        }

        var uid = ApiHelpers.UserId(context.User);
        if (string.IsNullOrWhiteSpace(uid))
        {
            await next(context);
            return;
        }

        var deviceId = context.Request.Cookies[DeviceCookie];
        if (!ValidDeviceId(deviceId))
        {
            deviceId = Guid.NewGuid().ToString("N");
            context.Response.Cookies.Append(DeviceCookie, deviceId, new CookieOptions
            {
                HttpOnly = true,
                Secure = context.Request.IsHttps,
                SameSite = SameSiteMode.Lax,
                IsEssential = true,
                MaxAge = TimeSpan.FromDays(30),
                Path = "/"
            });
        }

        var now = DateTimeOffset.UtcNow;
        var session = await db.UserSessions.FirstOrDefaultAsync(x => x.UserId == uid && x.DeviceId == deviceId, context.RequestAborted);
        if (session?.RevokedAt is not null)
        {
            await context.SignOutAsync(IdentityConstants.ApplicationScheme);
            context.Response.Cookies.Delete(DeviceCookie);
            if (context.Request.Path.StartsWithSegments("/api"))
            {
                context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                await context.Response.WriteAsJsonAsync(new { error = "session_revoked" }, context.RequestAborted);
            }
            else
            {
                context.Response.Redirect("/login.html?session=revoked");
            }
            return;
        }

        if (session is null)
        {
            session = new UserSession
            {
                UserId = uid,
                DeviceId = deviceId!,
                DeviceLabel = DeviceLabel(context.Request.Headers.UserAgent.ToString()),
                UserAgentHash = Hash(context.Request.Headers.UserAgent.ToString()),
                IpHint = IpHint(context.Connection.RemoteIpAddress?.ToString()),
                CreatedAt = now,
                LastSeenAt = now
            };
            db.UserSessions.Add(session);
            await db.SaveChangesAsync(context.RequestAborted);
        }
        else if (now - session.LastSeenAt > TimeSpan.FromMinutes(3))
        {
            session.LastSeenAt = now;
            session.DeviceLabel = DeviceLabel(context.Request.Headers.UserAgent.ToString());
            session.UserAgentHash = Hash(context.Request.Headers.UserAgent.ToString());
            session.IpHint = IpHint(context.Connection.RemoteIpAddress?.ToString());
            await db.SaveChangesAsync(context.RequestAborted);
        }

        context.Items["KOTAKAS_DEVICE_ID"] = deviceId;
        await next(context);
    }

    private static bool ValidDeviceId(string? value) => value?.Length == 32 && value.All(Uri.IsHexDigit);

    private static string DeviceLabel(string ua)
    {
        if (ua.Contains("Android", StringComparison.OrdinalIgnoreCase)) return "Android cihaz";
        if (ua.Contains("iPhone", StringComparison.OrdinalIgnoreCase)) return "iPhone";
        if (ua.Contains("iPad", StringComparison.OrdinalIgnoreCase)) return "iPad";
        if (ua.Contains("Windows", StringComparison.OrdinalIgnoreCase)) return "Windows bilgisayar";
        if (ua.Contains("Macintosh", StringComparison.OrdinalIgnoreCase)) return "Mac";
        if (ua.Contains("Linux", StringComparison.OrdinalIgnoreCase)) return "Linux cihaz";
        return "Bilinmeyen cihaz";
    }

    private static string Hash(string value)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(value ?? ""));
        return Convert.ToHexString(bytes)[..16];
    }

    private static string IpHint(string? ip)
    {
        if (string.IsNullOrWhiteSpace(ip)) return "—";
        if (ip.Contains('.'))
        {
            var p = ip.Split('.');
            return p.Length == 4 ? $"{p[0]}.{p[1]}.{p[2]}.x" : "—";
        }
        var parts = ip.Split(':', StringSplitOptions.RemoveEmptyEntries);
        return parts.Length >= 3 ? string.Join(':', parts.Take(3)) + "::" : "IPv6";
    }
}
