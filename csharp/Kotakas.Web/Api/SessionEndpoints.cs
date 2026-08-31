using System.Security.Claims;
using Kotakas.Web.Data;
using Kotakas.Web.Services;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace Kotakas.Web.Api;

public static class SessionEndpoints
{
    public static IEndpointRouteBuilder MapSessionEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/account/sessions", async (ClaimsPrincipal p, HttpContext http, AppDbContext db) =>
        {
            var uid = ApiHelpers.UserId(p);
            var current = http.Items["KOTAKAS_DEVICE_ID"]?.ToString() ?? http.Request.Cookies[SessionSecurityMiddleware.DeviceCookie] ?? "";

            // Aynı bilgisayar/tarayıcı için zaman içinde birden fazla device cookie oluşmuş olabilir
            // (ör. localhost / 127.0.0.1 veya cookie yenilenmesi). Bunları kullanıcıya ayrı
            // fiziksel cihazlarmış gibi göstermiyoruz. Aynı cihaz etiketi + tarayıcı imzası + IP
            // ipucu tek satırda birleştirilir; mevcut oturum varsa her zaman o satır korunur.
            var active = await db.UserSessions.AsNoTracking()
                .Where(x => x.UserId == uid && x.RevokedAt == null)
                .ToListAsync();

            var rows = active
                .GroupBy(x => new
                {
                    Label = x.DeviceLabel ?? "",
                    Hash = string.IsNullOrWhiteSpace(x.UserAgentHash) ? x.DeviceId : x.UserAgentHash,
                    Ip = x.IpHint ?? ""
                })
                .Select(g => g.FirstOrDefault(x => x.DeviceId == current)
                             ?? g.OrderByDescending(x => x.LastSeenAt).First())
                .OrderByDescending(x => x.DeviceId == current)
                .ThenByDescending(x => x.LastSeenAt)
                .Take(50)
                .Select(x => new
                {
                    x.DeviceId,
                    x.DeviceLabel,
                    x.IpHint,
                    x.CreatedAt,
                    x.LastSeenAt,
                    current = x.DeviceId == current
                })
                .ToList();

            return Results.Ok(new { sessions = rows });
        }).RequireAuthorization();

        app.MapDelete("/api/account/sessions/{deviceId}", async (string deviceId, ClaimsPrincipal p, HttpContext http, AppDbContext db) =>
        {
            var uid = ApiHelpers.UserId(p);
            var row = await db.UserSessions.FirstOrDefaultAsync(x => x.UserId == uid && x.DeviceId == deviceId && x.RevokedAt == null);
            if (row is null) return Results.NotFound();
            row.RevokedAt = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync();

            var current = http.Items["KOTAKAS_DEVICE_ID"]?.ToString() ?? http.Request.Cookies[SessionSecurityMiddleware.DeviceCookie] ?? "";
            if (string.Equals(current, deviceId, StringComparison.Ordinal))
            {
                await http.SignOutAsync(IdentityConstants.ApplicationScheme);
                http.Response.Cookies.Delete(SessionSecurityMiddleware.DeviceCookie);
            }
            return Results.Ok(new { ok = true, currentSessionRevoked = current == deviceId });
        }).RequireAuthorization();

        app.MapPost("/api/account/sessions/revoke-others", async (ClaimsPrincipal p, HttpContext http, AppDbContext db) =>
        {
            var uid = ApiHelpers.UserId(p);
            var current = http.Items["KOTAKAS_DEVICE_ID"]?.ToString() ?? http.Request.Cookies[SessionSecurityMiddleware.DeviceCookie] ?? "";
            var now = DateTimeOffset.UtcNow;
            var rows = await db.UserSessions.Where(x => x.UserId == uid && x.RevokedAt == null && x.DeviceId != current).ToListAsync();
            foreach (var row in rows) row.RevokedAt = now;
            await db.SaveChangesAsync();
            return Results.Ok(new { ok = true, revoked = rows.Count });
        }).RequireAuthorization();

        return app;
    }
}
