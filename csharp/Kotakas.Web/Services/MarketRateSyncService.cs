using System.Globalization;
using System.Net;
using System.Text.Json;
using System.Text.RegularExpressions;
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
        request.Headers.TryAddWithoutValidation("User-Agent", "Mozilla/5.0 (compatible; KOTAKAS-MarketRate/1.0)");
        request.Headers.TryAddWithoutValidation("Accept-Language", "tr-TR,tr;q=0.9,en;q=0.7");
        var header = configuration["MarketRateFeed:ApiKeyHeader"]?.Trim();
        var apiKey = configuration["MarketRateFeed:ApiKey"]?.Trim();
        if (!string.IsNullOrWhiteSpace(header) && !string.IsNullOrWhiteSpace(apiKey))
            request.Headers.TryAddWithoutValidation(header, apiKey);

        var client = httpClients.CreateClient(nameof(MarketRateSyncService));
        client.Timeout = TimeSpan.FromSeconds(12);
        using var response = await client.SendAsync(request, cancellationToken);
        response.EnsureSuccessStatusCode();

        var feedMode = (configuration["MarketRateFeed:Mode"] ?? "json").Trim().ToLowerInvariant();
        decimal rate;
        decimal? sourceBuyTryPerGb = null;
        decimal? sourceSellTryPerGb = null;
        var sourceName = configuration["MarketRateFeed:SourceName"]?.Trim();
        if (string.IsNullOrWhiteSpace(sourceName)) sourceName = feedMode.Contains("kopazar") ? "Kopazar ZERO" : "Harici kur kaynağı";

        if (feedMode is "kopazar_html" or "html")
        {
            var html = await response.Content.ReadAsStringAsync(cancellationToken);
            var text = NormalizeHtmlText(html);
            var buyUnit = TryReadKopazarPrice(text, "Satın Al", out var buyPrice) ? buyPrice : (decimal?)null;
            var sellUnit = TryReadKopazarPrice(text, "Bize Sat", out var sellPrice) ? sellPrice : (decimal?)null;
            var unitMillions = configuration.GetValue<decimal?>("MarketRateFeed:HtmlUnitMillions") ?? 10m;
            if (unitMillions <= 0 || unitMillions > 100m) throw new InvalidOperationException("MarketRateFeed HtmlUnitMillions is invalid.");
            var multiplier = 100m / unitMillions;
            if (buyUnit is not null) sourceBuyTryPerGb = Math.Round(buyUnit.Value * multiplier, 2, MidpointRounding.AwayFromZero);
            if (sellUnit is not null) sourceSellTryPerGb = Math.Round(sellUnit.Value * multiplier, 2, MidpointRounding.AwayFromZero);

            var side = (configuration["MarketRateFeed:HtmlPriceSide"] ?? "buy").Trim().ToLowerInvariant();
            rate = side == "sell"
                ? sourceSellTryPerGb ?? throw new InvalidOperationException("Kopazar 'Bize Sat' GB price could not be parsed.")
                : sourceBuyTryPerGb ?? throw new InvalidOperationException("Kopazar 'Satın Al' GB price could not be parsed.");
        }
        else
        {
            await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
            using var json = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
            var propertyPath = configuration["MarketRateFeed:JsonProperty"]?.Trim();
            if (string.IsNullOrWhiteSpace(propertyPath)) propertyPath = "tryPerGb";
            if (!TryReadDecimal(json.RootElement, propertyPath!, out rate))
                throw new InvalidOperationException("MarketRateFeed JSON rate could not be parsed.");
        }

        if (rate <= 0 || rate > 10_000_000m)
            throw new InvalidOperationException("MarketRateFeed returned an invalid GB/TRY rate.");

        await using var scope = scopes.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var modeSetting = await db.SiteSettings.AsNoTracking().FirstOrDefaultAsync(x => x.Key == "gb_try_rate_mode", cancellationToken);
        var effectiveMode = string.Equals(modeSetting?.Value, "manual", StringComparison.OrdinalIgnoreCase) ? "manual" : "auto";

        await Upsert(db, "gb_try_rate_feed", rate.ToString(CultureInfo.InvariantCulture));
        if (sourceBuyTryPerGb is not null) await Upsert(db, "gb_try_rate_source_buy", sourceBuyTryPerGb.Value.ToString(CultureInfo.InvariantCulture));
        if (sourceSellTryPerGb is not null) await Upsert(db, "gb_try_rate_source_sell", sourceSellTryPerGb.Value.ToString(CultureInfo.InvariantCulture));
        await Upsert(db, "gb_try_rate_source", url);
        await Upsert(db, "gb_try_rate_source_name", sourceName!);
        await Upsert(db, "gb_try_rate_updated_at", DateTimeOffset.UtcNow.ToString("O", CultureInfo.InvariantCulture));
        await Upsert(db, "gb_try_rate_sync_status", "ok");
        if (effectiveMode == "auto")
            await Upsert(db, "gb_try_rate", rate.ToString(CultureInfo.InvariantCulture));

        // KOTAKAS'in kendi hazır GB satış stoğu da aynı canlı Kopazar "Satın Al"
        // fiyatını kullanır. Kopazar 10M fiyat verdiği için yukarıda 1 GB (100M)
        // karşılığına çevrilmiştir. Satışın açık/kapalı durumu ve rezerv miktarı korunur.
        if (feedMode is "kopazar_html" or "html" && sourceBuyTryPerGb is > 0)
        {
            var serverCode = (configuration["MarketRateFeed:ServerCode"] ?? "ZERO").Trim().ToUpperInvariant();
            if (serverCode.Length >= 2)
            {
                await db.Database.ExecuteSqlInterpolatedAsync($"""
                    INSERT INTO "KotakasGbSaleSettings" ("ServerCode","SalePriceTry","ReservedGb","IsActive","UpdatedAt")
                    VALUES ({serverCode},{sourceBuyTryPerGb.Value},0,0,{DateTimeOffset.UtcNow})
                    ON CONFLICT("ServerCode") DO UPDATE SET
                        "SalePriceTry"=excluded."SalePriceTry",
                        "UpdatedAt"=excluded."UpdatedAt"
                    """, cancellationToken);
                await Upsert(db, "gb_try_rate_server", serverCode);
            }
        }

        await db.SaveChangesAsync(cancellationToken);

        logger.LogInformation(
            "KOTAKAS GB/TRY synchronized from {Source}: buy={BuyRate}, sell={SellRate}, effective={Rate} (mode: {Mode})",
            sourceName, sourceBuyTryPerGb, sourceSellTryPerGb, rate, effectiveMode);
    }

    private static string NormalizeHtmlText(string html)
    {
        var withoutScripts = Regex.Replace(html, @"<(script|style)[^>]*>.*?</\1>", " ", RegexOptions.IgnoreCase | RegexOptions.Singleline);
        var withoutTags = Regex.Replace(withoutScripts, @"<[^>]+>", " ");
        var decoded = WebUtility.HtmlDecode(withoutTags);
        return Regex.Replace(decoded, @"\s+", " ").Trim();
    }

    private static bool TryReadKopazarPrice(string text, string label, out decimal value)
    {
        value = 0m;
        var pattern = $@"(?<price>\d{{1,3}}(?:\.\d{{3}})*(?:,\d{{1,2}})?|\d+(?:[.,]\d{{1,2}})?)\s*TL\s*{Regex.Escape(label)}";
        var match = Regex.Match(text, pattern, RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
        if (!match.Success) return false;
        var raw = match.Groups["price"].Value;
        return decimal.TryParse(raw, NumberStyles.Number, new CultureInfo("tr-TR"), out value)
            || decimal.TryParse(raw, NumberStyles.Number, CultureInfo.InvariantCulture, out value);
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
