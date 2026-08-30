using Kotakas.Web.Data;
using Microsoft.EntityFrameworkCore;

namespace Kotakas.Web.Services;

public sealed class MaintenanceModeMiddleware
{
    private readonly RequestDelegate _next;
    private static readonly string[] BlockedPrefixes =
    {
        "/api/sale-requests",
        "/api/offers",
        "/api/listings",
        "/api/listing-price-offers",
        "/api/deals",
        "/api/payments/paid-listing",
        "/api/admin/wallets"
    };

    public MaintenanceModeMiddleware(RequestDelegate next) => _next = next;

    public async Task InvokeAsync(HttpContext context, AppDbContext db)
    {
        if (!IsMutation(context.Request.Method) || context.User.IsInRole("admin_owner") || context.User.IsInRole("admin_full") || context.User.IsInRole("admin_limited"))
        {
            await _next(context);
            return;
        }

        var path = context.Request.Path.Value ?? "";
        if (!BlockedPrefixes.Any(prefix => path.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)))
        {
            await _next(context);
            return;
        }

        var raw = await db.SiteSettings.AsNoTracking()
            .Where(x => x.Key == "maintenance_enabled")
            .Select(x => x.Value)
            .FirstOrDefaultAsync();
        if (!bool.TryParse(raw, out var enabled) || !enabled)
        {
            await _next(context);
            return;
        }

        var message = await db.SiteSettings.AsNoTracking()
            .Where(x => x.Key == "maintenance_message")
            .Select(x => x.Value)
            .FirstOrDefaultAsync();
        context.Response.StatusCode = StatusCodes.Status503ServiceUnavailable;
        await context.Response.WriteAsJsonAsync(new
        {
            error = "maintenance_mode",
            message = string.IsNullOrWhiteSpace(message)
                ? "KOTAKAS üzerinde planlı bakım yapılıyor. Pazar ve finans işlemleri geçici olarak durduruldu."
                : message
        });
    }

    private static bool IsMutation(string method) => method is "POST" or "PUT" or "PATCH" or "DELETE";
}
