using System.Globalization;
using System.Text.Json;
using Kotakas.Web.Data;
using Kotakas.Web.Models;
using Microsoft.EntityFrameworkCore;

namespace Kotakas.Web.Services;

public sealed class MarketRateSyncService(
    IServiceScopeFactory scopes,
    IHttpClientFactory httpClients,
    IConfiguration configuration,
    ILogger<MarketRateSyncService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try { await SyncOnce(stoppingToken); }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            catch (Exception ex) { logger.LogWarning(ex, "KOTAKAS automatic GB/TRY sync failed"); }

            var minutes = Math.Clamp(configuration.GetValue<int?>("MarketRateFeed:IntervalMinutes") ?? 15, 5, 1440);
            try { await Task.Delay(TimeSpan.FromMinutes(minutes), stoppingToken); }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
        }
    }

    private async Task SyncOnce(CancellationToken cancellationToken)
    {
        if (!configuration.GetValue<bool>("MarketRateFeed:Enabled")) return;
        var url = configuration["MarketRateFeed:Url"]?.Trim();
        if (string.IsNullOrWhiteSpace(url)) return;

        using var request = new HttpRequestMessage(HttpMethod.Get, url);
        var header = configuration["MarketRateFeed:ApiKeyHeader"]?.Trim();
        var apiKey = configuration["MarketRateFeed:ApiKey"]?.Trim();
        if (!string.IsNullOrWhiteSpace(header) && !string.IsNullOrWhiteSpace(apiKey))
            request.Headers.TryAddWithoutValidation(header, apiKey);

        var client = httpClients.CreateClient(nameof(MarketRateSyncService));
        client.Timeout = TimeSpan.FromSeconds(12);
        using var response = await client.SendAsync(request, cancellationToken);
        response.EnsureSuccessStatusCode();

        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var json = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
        var propertyPath = configuration["MarketRateFeed:JsonProperty"]?.Trim();
        if (string.IsNullOrWhiteSpace(propertyPath)) propertyPath = "tryPerGb";
        if (!TryReadDecimal(json.RootElement, propertyPath!, out var rate) || rate <= 0 || rate > 10_000_000m)
            throw new InvalidOperationException("MarketRateFeed returned an invalid GB/TRY rate.");

        await using var scope = scopes.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        await Upsert(db, "gb_try_rate", rate.ToString(CultureInfo.InvariantCulture));
        await Upsert(db, "gb_try_rate_source", url);
        await Upsert(db, "gb_try_rate_updated_at", DateTimeOffset.UtcNow.ToString("O", CultureInfo.InvariantCulture));
        await db.SaveChangesAsync(cancellationToken);
        logger.LogInformation("KOTAKAS GB/TRY rate synchronized: {Rate}", rate);
    }

    private static async Task Upsert(AppDbContext db, string key, string value)
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

    private static bool TryReadDecimal(JsonElement root, string path, out decimal value)
    {
        value = 0;
        var current = root;
        foreach (var segment in path.Split('.', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            if (current.ValueKind != JsonValueKind.Object) return false;
            JsonElement next = default;
            var found = false;
            foreach (var p in current.EnumerateObject())
            {
                if (!string.Equals(p.Name, segment, StringComparison.OrdinalIgnoreCase)) continue;
                next = p.Value; found = true; break;
            }
            if (!found) return false;
            current = next;
        }
        if (current.ValueKind == JsonValueKind.Number && current.TryGetDecimal(out value)) return true;
        if (current.ValueKind == JsonValueKind.String)
            return decimal.TryParse(current.GetString(), NumberStyles.Number, CultureInfo.InvariantCulture, out value)
                || decimal.TryParse(current.GetString(), NumberStyles.Number, new CultureInfo("tr-TR"), out value);
        return false;
    }
}
