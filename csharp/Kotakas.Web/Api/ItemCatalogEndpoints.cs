using System.Collections.Concurrent;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Kotakas.Web.Api;

public static class ItemCatalogEndpoints
{
    private const string WikiBase = "https://wiki.korehberi.com/api.php";
    private static readonly ConcurrentDictionary<string, CacheEntry> Cache = new(StringComparer.OrdinalIgnoreCase);
    private static readonly TimeSpan CacheTtl = TimeSpan.FromHours(12);

    public static IEndpointRouteBuilder MapItemCatalogEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/public/item-icons/search", async (string? q, IHttpClientFactory clients, CancellationToken cancellationToken) =>
        {
            var raw = (q ?? string.Empty).Trim();
            if (raw.Length < 2) return Results.Ok(new { query = raw, normalized = raw, items = Array.Empty<object>() });
            if (raw.Length > 100) return Results.BadRequest(new { error = "query_too_long" });

            var normalized = NormalizeItemName(raw);
            if (normalized.Length < 2) return Results.Ok(new { query = raw, normalized, items = Array.Empty<object>() });

            if (Cache.TryGetValue(normalized, out var cached) && DateTimeOffset.UtcNow - cached.CreatedAt < CacheTtl)
                return Results.Ok(new { query = raw, normalized, items = cached.Items });

            try
            {
                using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
                timeout.CancelAfter(TimeSpan.FromSeconds(5));
                var client = clients.CreateClient();
                client.DefaultRequestHeaders.UserAgent.ParseAdd("KOTAKAS/1.0 item-icon-lookup");

                var titles = await SearchTitlesAsync(client, normalized, timeout.Token);
                if (titles.Count == 0)
                {
                    Cache[normalized] = new CacheEntry(DateTimeOffset.UtcNow, []);
                    return Results.Ok(new { query = raw, normalized, items = Array.Empty<object>() });
                }

                var imageTitles = await LoadPageImagesAsync(client, titles, timeout.Token);
                var imageUrls = await LoadImageUrlsAsync(client, imageTitles.Values.Where(x => !string.IsNullOrWhiteSpace(x)).Distinct(StringComparer.OrdinalIgnoreCase).ToList(), timeout.Token);

                var items = titles.Select(title =>
                {
                    imageTitles.TryGetValue(title, out var imageTitle);
                    var icon = !string.IsNullOrWhiteSpace(imageTitle) && imageUrls.TryGetValue(imageTitle!, out var url) ? url : null;
                    return new ItemIconResult(
                        title,
                        icon,
                        $"https://wiki.korehberi.com/{Uri.EscapeDataString(title.Replace(' ', '_'))}");
                }).ToList();

                Cache[normalized] = new CacheEntry(DateTimeOffset.UtcNow, items);
                return Results.Ok(new { query = raw, normalized, items });
            }
            catch (OperationCanceledException)
            {
                return Results.Ok(new { query = raw, normalized, items = Array.Empty<object>(), sourceUnavailable = true });
            }
            catch
            {
                return Results.Ok(new { query = raw, normalized, items = Array.Empty<object>(), sourceUnavailable = true });
            }
        }).AllowAnonymous();

        return app;
    }

    private static string NormalizeItemName(string value)
    {
        var text = Regex.Replace(value, @"\s+", " ").Trim();
        text = Regex.Replace(text, @"\s*\+\s*\d+\b.*$", string.Empty, RegexOptions.IgnoreCase).Trim();
        text = Regex.Replace(text, @"\s*\((reverse|rebirth)[^)]*\)\s*$", string.Empty, RegexOptions.IgnoreCase).Trim();
        text = Regex.Replace(text, @"\s+(reverse|rebirth)\s*$", string.Empty, RegexOptions.IgnoreCase).Trim();
        return text;
    }

    private static async Task<List<string>> SearchTitlesAsync(HttpClient client, string query, CancellationToken ct)
    {
        var url = $"{WikiBase}?action=query&list=search&srnamespace=0&srlimit=8&srsearch={Uri.EscapeDataString(query)}&format=json&formatversion=2";
        using var response = await client.GetAsync(url, ct);
        if (!response.IsSuccessStatusCode) return [];
        await using var stream = await response.Content.ReadAsStreamAsync(ct);
        using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: ct);
        if (!doc.RootElement.TryGetProperty("query", out var q) || !q.TryGetProperty("search", out var search) || search.ValueKind != JsonValueKind.Array) return [];

        var rows = new List<string>();
        foreach (var row in search.EnumerateArray())
        {
            if (!row.TryGetProperty("title", out var titleProp)) continue;
            var title = titleProp.GetString()?.Trim();
            if (string.IsNullOrWhiteSpace(title)) continue;
            rows.Add(title);
        }

        return rows
            .OrderByDescending(x => string.Equals(x, query, StringComparison.OrdinalIgnoreCase))
            .ThenBy(x => Math.Abs(x.Length - query.Length))
            .Take(6)
            .ToList();
    }

    private static async Task<Dictionary<string, string?>> LoadPageImagesAsync(HttpClient client, List<string> titles, CancellationToken ct)
    {
        var map = titles.ToDictionary(x => x, _ => (string?)null, StringComparer.OrdinalIgnoreCase);
        if (titles.Count == 0) return map;

        var joined = string.Join('|', titles);
        var url = $"{WikiBase}?action=query&titles={Uri.EscapeDataString(joined)}&prop=images&imlimit=max&format=json&formatversion=2";
        using var response = await client.GetAsync(url, ct);
        if (!response.IsSuccessStatusCode) return map;
        await using var stream = await response.Content.ReadAsStreamAsync(ct);
        using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: ct);
        if (!doc.RootElement.TryGetProperty("query", out var q) || !q.TryGetProperty("pages", out var pages) || pages.ValueKind != JsonValueKind.Array) return map;

        foreach (var page in pages.EnumerateArray())
        {
            var title = page.TryGetProperty("title", out var tp) ? tp.GetString() : null;
            if (string.IsNullOrWhiteSpace(title) || !map.ContainsKey(title)) continue;
            if (!page.TryGetProperty("images", out var images) || images.ValueKind != JsonValueKind.Array) continue;

            var candidates = images.EnumerateArray()
                .Select(x => x.TryGetProperty("title", out var ip) ? ip.GetString() : null)
                .Where(x => !string.IsNullOrWhiteSpace(x))
                .Cast<string>()
                .ToList();

            var icon = candidates.FirstOrDefault(x => x.Contains("Itemicon", StringComparison.OrdinalIgnoreCase))
                ?? candidates.FirstOrDefault(x => FileNameLooksLikeItem(x, title));
            map[title] = icon;
        }

        return map;
    }

    private static bool FileNameLooksLikeItem(string fileTitle, string pageTitle)
    {
        var cleanFile = Regex.Replace(fileTitle.Replace("Dosya:", "", StringComparison.OrdinalIgnoreCase).Replace("File:", "", StringComparison.OrdinalIgnoreCase), @"\.(png|jpg|jpeg|webp)$", "", RegexOptions.IgnoreCase);
        return cleanFile.Contains(pageTitle, StringComparison.OrdinalIgnoreCase) || pageTitle.Contains(cleanFile, StringComparison.OrdinalIgnoreCase);
    }

    private static async Task<Dictionary<string, string>> LoadImageUrlsAsync(HttpClient client, List<string> imageTitles, CancellationToken ct)
    {
        var map = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        if (imageTitles.Count == 0) return map;

        var joined = string.Join('|', imageTitles);
        var url = $"{WikiBase}?action=query&titles={Uri.EscapeDataString(joined)}&prop=imageinfo&iiprop=url&iiurlwidth=90&format=json&formatversion=2";
        using var response = await client.GetAsync(url, ct);
        if (!response.IsSuccessStatusCode) return map;
        await using var stream = await response.Content.ReadAsStreamAsync(ct);
        using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: ct);
        if (!doc.RootElement.TryGetProperty("query", out var q) || !q.TryGetProperty("pages", out var pages) || pages.ValueKind != JsonValueKind.Array) return map;

        foreach (var page in pages.EnumerateArray())
        {
            var title = page.TryGetProperty("title", out var tp) ? tp.GetString() : null;
            if (string.IsNullOrWhiteSpace(title)) continue;
            if (!page.TryGetProperty("imageinfo", out var info) || info.ValueKind != JsonValueKind.Array || info.GetArrayLength() == 0) continue;
            var first = info[0];
            var urlValue = first.TryGetProperty("thumburl", out var thumb) ? thumb.GetString() : first.TryGetProperty("url", out var raw) ? raw.GetString() : null;
            if (!string.IsNullOrWhiteSpace(urlValue)) map[title] = urlValue!;
        }

        return map;
    }

    private sealed record ItemIconResult(string Name, string? IconUrl, string SourceUrl);
    private sealed record CacheEntry(DateTimeOffset CreatedAt, List<ItemIconResult> Items);
}
