using Kotakas.Web.Data;

namespace Kotakas.Web.Api;

public static class IntegrationEndpoints
{
    public static IEndpointRouteBuilder MapIntegrationEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/market-rate", async (AppDbContext db, IConfiguration configuration) =>
        {
            var rate = await ApiHelpers.SettingDecimal(db, "gb_try_rate", 0m);
            var sourceRow = await db.SiteSettings.FindAsync("gb_try_rate_source");
            var updatedRow = await db.SiteSettings.FindAsync("gb_try_rate_updated_at");
            var source = "manual";
            if (Uri.TryCreate(sourceRow?.Value, UriKind.Absolute, out var uri)) source = uri.Host;
            return Results.Ok(new
            {
                tryPerGb = rate,
                source,
                updatedAt = updatedRow?.Value,
                automaticEnabled = configuration.GetValue<bool>("MarketRateFeed:Enabled"),
                automaticConfigured = !string.IsNullOrWhiteSpace(configuration["MarketRateFeed:Url"])
            });
        });

        app.MapGet("/api/payments/status", (IConfiguration configuration) =>
        {
            var provider = configuration["Payments:Provider"]?.Trim().ToLowerInvariant();
            if (string.IsNullOrWhiteSpace(provider)) provider = "disabled";
            var enabled = provider != "disabled";
            var configured = enabled &&
                !string.IsNullOrWhiteSpace(configuration["Payments:ApiKey"]) &&
                !string.IsNullOrWhiteSpace(configuration["Payments:SecretKey"]) &&
                !string.IsNullOrWhiteSpace(configuration["Payments:CallbackBaseUrl"]);
            return Results.Ok(new { provider, enabled, configured });
        });

        return app;
    }
}
