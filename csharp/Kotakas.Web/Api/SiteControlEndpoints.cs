using Kotakas.Web.Data;
using Kotakas.Web.Models;
using Kotakas.Web.Services;

namespace Kotakas.Web.Api;

public static class SiteControlEndpoints
{
    public static IEndpointRouteBuilder MapSiteControlEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/site-state", (SiteRuntimeState state) => Results.Ok(state.Snapshot()));

        var admin = app.MapGroup("/api/admin/site-state")
            .RequireAuthorization(p => p.RequireRole("admin_owner", "admin_full"));

        admin.MapGet("/", (SiteRuntimeState state) => Results.Ok(state.Snapshot()));
        admin.MapPut("/", async (SiteStateInput input, SiteRuntimeState state, AppDbContext db) =>
        {
            var announcement = (input.AnnouncementText ?? "").Trim();
            var maintenance = (input.MaintenanceMessage ?? "").Trim();
            var tone = (input.AnnouncementTone ?? "info").Trim().ToLowerInvariant();
            if (announcement.Length > 240 || maintenance.Length > 300 || tone is not ("info" or "warning" or "success"))
                return Results.BadRequest(new { error = "invalid_site_state" });
            if (input.AnnouncementEnabled && announcement.Length < 3)
                return Results.BadRequest(new { error = "announcement_text_required" });
            if (input.MaintenanceEnabled && maintenance.Length < 3)
                maintenance = "KOTAKAS kısa süreli bakımda. Lütfen biraz sonra tekrar dene.";

            var values = new Dictionary<string, string>
            {
                ["announcement_enabled"] = input.AnnouncementEnabled.ToString(),
                ["announcement_text"] = announcement,
                ["announcement_tone"] = tone,
                ["maintenance_enabled"] = input.MaintenanceEnabled.ToString(),
                ["maintenance_message"] = maintenance
            };
            foreach (var (key, value) in values)
            {
                var row = await db.SiteSettings.FindAsync(key);
                if (row is null)
                {
                    row = new SiteSetting { Key = key };
                    db.SiteSettings.Add(row);
                }
                row.Value = value;
                row.UpdatedAt = DateTimeOffset.UtcNow;
            }
            await db.SaveChangesAsync();
            state.Apply(input.MaintenanceEnabled, maintenance, input.AnnouncementEnabled, announcement, tone);
            return Results.Ok(new { ok = true, state = state.Snapshot() });
        });

        return app;
    }
}

public sealed record SiteStateInput(bool MaintenanceEnabled, string? MaintenanceMessage, bool AnnouncementEnabled, string? AnnouncementText, string? AnnouncementTone);
