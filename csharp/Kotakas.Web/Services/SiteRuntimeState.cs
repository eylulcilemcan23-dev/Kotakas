using Kotakas.Web.Data;
using Kotakas.Web.Models;
using Microsoft.EntityFrameworkCore;

namespace Kotakas.Web.Services;

public sealed class SiteRuntimeState
{
    private readonly object _gate = new();
    private bool _maintenanceEnabled;
    private string _maintenanceMessage = "KOTAKAS kısa süreli bakımda. Lütfen biraz sonra tekrar dene.";
    private bool _announcementEnabled;
    private string _announcementText = "";
    private string _announcementTone = "info";

    public SiteStateSnapshot Snapshot()
    {
        lock (_gate)
            return new SiteStateSnapshot(_maintenanceEnabled, _maintenanceMessage, _announcementEnabled, _announcementText, _announcementTone);
    }

    public void Apply(bool maintenanceEnabled, string maintenanceMessage, bool announcementEnabled, string announcementText, string announcementTone)
    {
        lock (_gate)
        {
            _maintenanceEnabled = maintenanceEnabled;
            _maintenanceMessage = string.IsNullOrWhiteSpace(maintenanceMessage) ? "KOTAKAS kısa süreli bakımda. Lütfen biraz sonra tekrar dene." : maintenanceMessage.Trim();
            _announcementEnabled = announcementEnabled;
            _announcementText = (announcementText ?? "").Trim();
            _announcementTone = announcementTone is "warning" or "success" ? announcementTone : "info";
        }
    }

    public static async Task InitializeAsync(WebApplication app)
    {
        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var state = scope.ServiceProvider.GetRequiredService<SiteRuntimeState>();
        var keys = new[] { "maintenance_enabled", "maintenance_message", "announcement_enabled", "announcement_text", "announcement_tone" };
        var rows = await db.SiteSettings.AsNoTracking().Where(x => keys.Contains(x.Key)).ToDictionaryAsync(x => x.Key, x => x.Value);
        state.Apply(
            rows.TryGetValue("maintenance_enabled", out var m) && bool.TryParse(m, out var mb) && mb,
            rows.TryGetValue("maintenance_message", out var mm) ? mm : "KOTAKAS kısa süreli bakımda. Lütfen biraz sonra tekrar dene.",
            rows.TryGetValue("announcement_enabled", out var a) && bool.TryParse(a, out var ab) && ab,
            rows.TryGetValue("announcement_text", out var at) ? at : "",
            rows.TryGetValue("announcement_tone", out var tone) ? tone : "info");
    }
}

public sealed record SiteStateSnapshot(bool MaintenanceEnabled, string MaintenanceMessage, bool AnnouncementEnabled, string AnnouncementText, string AnnouncementTone);

public sealed class MaintenanceModeMiddleware(RequestDelegate next)
{
    private static readonly string[] AllowedMutationPrefixes =
    {
        "/api/login", "/api/logout", "/api/auth", "/api/site-state", "/api/health", "/api/me", "/api/payments/iyzico/callback", "/api/presence/heartbeat"
    };

    public async Task InvokeAsync(HttpContext context, SiteRuntimeState state)
    {
        var snapshot = state.Snapshot();
        if (!snapshot.MaintenanceEnabled || !IsMutation(context.Request.Method) || !context.Request.Path.StartsWithSegments("/api"))
        {
            await next(context);
            return;
        }

        if (context.User.IsInRole("admin_owner") || context.User.IsInRole("admin_full") || context.User.IsInRole("admin_limited"))
        {
            await next(context);
            return;
        }

        var path = context.Request.Path.Value ?? "";
        if (AllowedMutationPrefixes.Any(prefix => path.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)))
        {
            await next(context);
            return;
        }

        context.Response.StatusCode = StatusCodes.Status503ServiceUnavailable;
        await context.Response.WriteAsJsonAsync(new { error = "maintenance_mode", message = snapshot.MaintenanceMessage });
    }

    private static bool IsMutation(string method) => method is "POST" or "PUT" or "PATCH" or "DELETE";
}
