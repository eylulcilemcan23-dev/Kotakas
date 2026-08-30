using System.Globalization;
using Kotakas.Web.Data;
using Kotakas.Web.Models;
using Microsoft.EntityFrameworkCore;

namespace Kotakas.Web.Services;

public sealed class RiskDetectionService(IServiceScopeFactory scopeFactory, ILogger<RiskDetectionService> logger)
{
    private readonly SemaphoreSlim _gate = new(1, 1);

    private static readonly HashSet<string> StateCodes = new(StringComparer.Ordinal)
    {
        "wallet_negative",
        "wallet_ledger_mismatch",
        "deal_negative_escrow",
        "deal_closed_escrow_remaining",
        "deal_escrow_over_gross",
        "deal_stale_escrow"
    };

    public async Task<RiskScanResult> ScanNowAsync(CancellationToken cancellationToken = default)
    {
        if (!await _gate.WaitAsync(0, cancellationToken))
            return new RiskScanResult(false, 0, 0, 0, 0, "scan_already_running");

        try
        {
            using var scope = scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var now = DateTimeOffset.UtcNow;
            var findings = new Dictionary<string, RiskFinding>(StringComparer.Ordinal);
            var settings = await db.SiteSettings.AsNoTracking().ToDictionaryAsync(x => x.Key, x => x.Value, cancellationToken);
            var largeAdjustmentTry = SettingDecimal(settings, "risk_large_adjustment_try", 50_000m);
            var velocityTry = SettingDecimal(settings, "risk_wallet_velocity_try", 100_000m);
            var disputeCount = Math.Max(2, SettingInt(settings, "risk_disputes_24h", 3));
            var staleEscrowHours = Math.Clamp(SettingInt(settings, "risk_stale_escrow_hours", 72), 24, 24 * 30);

            var wallets = await db.Wallets.AsNoTracking().ToListAsync(cancellationToken);
            var latestLedgerIds = await db.WalletLedgers.AsNoTracking()
                .GroupBy(x => x.UserId)
                .Select(g => g.Max(x => x.Id))
                .ToListAsync(cancellationToken);
            var latestLedgers = latestLedgerIds.Count == 0
                ? new List<WalletLedger>()
                : await db.WalletLedgers.AsNoTracking().Where(x => latestLedgerIds.Contains(x.Id)).ToListAsync(cancellationToken);
            var latestByUser = latestLedgers.ToDictionary(x => x.UserId, StringComparer.Ordinal);

            foreach (var wallet in wallets)
            {
                if (Money(wallet.BalanceTry) < 0)
                {
                    Add(findings, new RiskFinding(
                        $"wallet_negative:{wallet.UserId}", "wallet_negative", "critical", wallet.UserId, null, null, wallet.BalanceTry,
                        "Negatif kullanıcı bakiyesi",
                        $"Cüzdan bakiyesi {wallet.BalanceTry:0.00} ₺. Kullanıcı bakiyesi sıfırın altında olmamalı."));
                }

                if (latestByUser.TryGetValue(wallet.UserId, out var latest) && Money(latest.AfterTry) != Money(wallet.BalanceTry))
                {
                    Add(findings, new RiskFinding(
                        $"wallet_ledger_mismatch:{wallet.UserId}", "wallet_ledger_mismatch", "critical", wallet.UserId, null, latest.Id,
                        wallet.BalanceTry - latest.AfterTry,
                        "Cüzdan ile son ledger kaydı uyuşmuyor",
                        $"Cüzdan {wallet.BalanceTry:0.00} ₺, son hareket sonrası bakiye {latest.AfterTry:0.00} ₺. Fark {(wallet.BalanceTry - latest.AfterTry):0.00} ₺."));
                }
            }

            var chainRows = await db.WalletLedgers.AsNoTracking().OrderByDescending(x => x.Id).Take(5000).ToListAsync(cancellationToken);
            foreach (var group in chainRows.GroupBy(x => x.UserId, StringComparer.Ordinal))
            {
                WalletLedger? previous = null;
                foreach (var row in group.OrderBy(x => x.Id))
                {
                    if (previous is not null && Money(previous.AfterTry) != Money(row.BeforeTry))
                    {
                        Add(findings, new RiskFinding(
                            $"ledger_chain_break:{row.Id}", "ledger_chain_break", "high", row.UserId, null, row.Id,
                            row.BeforeTry - previous.AfterTry,
                            "Bakiye hareket zincirinde kopukluk",
                            $"Ledger #{previous.Id} sonrası {previous.AfterTry:0.00} ₺ iken #{row.Id} öncesi {row.BeforeTry:0.00} ₺."));
                    }
                    if (Money(row.AfterTry) != Money(row.BeforeTry + row.AmountTry))
                    {
                        Add(findings, new RiskFinding(
                            $"ledger_math_error:{row.Id}", "ledger_math_error", "critical", row.UserId, null, row.Id,
                            row.AfterTry - (row.BeforeTry + row.AmountTry),
                            "Ledger matematik kontrolü başarısız",
                            $"#{row.Id}: {row.BeforeTry:0.00} + {row.AmountTry:0.00} işlemi {row.AfterTry:0.00} sonucunu vermiyor."));
                    }
                    previous = row;
                }
            }

            var deals = await db.Deals.AsNoTracking().OrderByDescending(x => x.Id).Take(10000).ToListAsync(cancellationToken);
            foreach (var deal in deals)
            {
                if (Money(deal.EscrowTry) < 0)
                {
                    Add(findings, new RiskFinding(
                        $"deal_negative_escrow:{deal.Id}", "deal_negative_escrow", "critical", ApiHelpers.DealBuyerUserId(deal), deal.Id, null,
                        deal.EscrowTry, "Negatif escrow tespit edildi", $"İşlem #{deal.Id} escrow değeri {deal.EscrowTry:0.00} ₺."));
                }

                if (deal.Status is "completed" or "refunded" && Money(deal.EscrowTry) != 0)
                {
                    Add(findings, new RiskFinding(
                        $"deal_closed_escrow_remaining:{deal.Id}", "deal_closed_escrow_remaining", "critical", ApiHelpers.DealBuyerUserId(deal), deal.Id, null,
                        deal.EscrowTry, "Kapanmış işlemde escrow kaldı", $"İşlem #{deal.Id} durumu {deal.Status} ancak emanet bakiyede {deal.EscrowTry:0.00} ₺ görünüyor."));
                }

                if (Money(deal.EscrowTry) > Money(deal.GrossTry) && Money(deal.GrossTry) >= 0)
                {
                    Add(findings, new RiskFinding(
                        $"deal_escrow_over_gross:{deal.Id}", "deal_escrow_over_gross", "critical", ApiHelpers.DealBuyerUserId(deal), deal.Id, null,
                        deal.EscrowTry - deal.GrossTry, "Escrow işlem toplamından büyük", $"İşlem #{deal.Id}: escrow {deal.EscrowTry:0.00} ₺, brüt işlem {deal.GrossTry:0.00} ₺."));
                }

                if (deal.EscrowTry > 0 && deal.Status is not ("completed" or "refunded") && deal.CreatedAt <= now.AddHours(-staleEscrowHours))
                {
                    Add(findings, new RiskFinding(
                        $"deal_stale_escrow:{deal.Id}", "deal_stale_escrow", "high", ApiHelpers.DealBuyerUserId(deal), deal.Id, null,
                        deal.EscrowTry, "Uzun süredir bekleyen escrow", $"İşlem #{deal.Id} {staleEscrowHours}+ saattir kapanmamış; emanet {deal.EscrowTry:0.00} ₺."));
                }
            }

            var recentLedgers = chainRows.Where(x => x.CreatedAt >= now.AddDays(-7)).ToList();
            foreach (var row in recentLedgers.Where(x => !string.IsNullOrWhiteSpace(x.AdminUserId) && Math.Abs(x.AmountTry) >= largeAdjustmentTry))
            {
                Add(findings, new RiskFinding(
                    $"large_admin_adjustment:{row.Id}", "large_admin_adjustment", "high", row.UserId, null, row.Id, row.AmountTry,
                    "Yüksek tutarlı admin bakiye işlemi",
                    $"Ledger #{row.Id}: {row.AmountTry:0.00} ₺ yönetici işlemi. Eşik {largeAdjustmentTry:0.00} ₺."));
            }

            var oneHour = now.AddHours(-1);
            foreach (var group in chainRows.Where(x => x.CreatedAt >= oneHour).GroupBy(x => x.UserId, StringComparer.Ordinal))
            {
                var rows = group.ToList();
                var movement = rows.Sum(x => Math.Abs(x.AmountTry));
                if (rows.Count >= 3 && movement >= velocityTry)
                {
                    Add(findings, new RiskFinding(
                        $"wallet_velocity:{group.Key}:{now:yyyyMMddHH}", "wallet_velocity", "high", group.Key, null, rows.Max(x => x.Id), movement,
                        "Kısa sürede yüksek bakiye hareketi",
                        $"Son 1 saatte {rows.Count} hareket, toplam mutlak hareket {movement:0.00} ₺. Eşik {velocityTry:0.00} ₺."));
                }
            }

            var disputedRecent = deals.Where(x => x.Status == "disputed" && x.CreatedAt >= now.AddHours(-24)).ToList();
            var disputeUsers = disputedRecent
                .SelectMany(x => new[] { x.UserId, x.TraderUserId })
                .Where(x => !string.IsNullOrWhiteSpace(x))
                .GroupBy(x => x, StringComparer.Ordinal);
            foreach (var group in disputeUsers)
            {
                var count = group.Count();
                if (count >= disputeCount)
                {
                    Add(findings, new RiskFinding(
                        $"dispute_velocity:{group.Key}:{now:yyyyMMdd}", "dispute_velocity", "high", group.Key, null, null, null,
                        "Kısa sürede çok sayıda anlaşmazlık",
                        $"Kullanıcı son 24 saatte {count} açık anlaşmazlığın tarafı. Eşik {disputeCount}."));
                }
            }

            // SQLite, DateTimeOffset karşılaştırmasını bu sorguda SQL'e çeviremiyor.
            // Durum/ID filtresini veritabanında, saat eşiğini ise bellekte uyguluyoruz.
            var failedPayments = (await db.PaymentIntents.AsNoTracking()
                .Where(x => x.Status == "failed")
                .OrderByDescending(x => x.Id).Take(5000).ToListAsync(cancellationToken))
                .Where(x => x.CreatedAt >= oneHour)
                .ToList();
            foreach (var group in failedPayments.GroupBy(x => x.UserId, StringComparer.Ordinal).Where(x => x.Count() >= 5))
            {
                Add(findings, new RiskFinding(
                    $"payment_failures:{group.Key}:{now:yyyyMMddHH}", "payment_failures", "medium", group.Key, null, null, null,
                    "Tekrarlanan başarısız ödeme denemeleri",
                    $"Son 1 saatte {group.Count()} başarısız ödeme kaydı tespit edildi."));
            }

            var fingerprints = findings.Keys.ToList();
            var existing = fingerprints.Count == 0
                ? new Dictionary<string, RiskSignal>(StringComparer.Ordinal)
                : (await db.RiskSignals.Where(x => fingerprints.Contains(x.Fingerprint)).ToListAsync(cancellationToken))
                    .ToDictionary(x => x.Fingerprint, StringComparer.Ordinal);

            var added = 0;
            foreach (var finding in findings.Values)
            {
                if (existing.TryGetValue(finding.Fingerprint, out var row))
                {
                    row.LastDetectedAt = now;
                    row.AmountTry = finding.AmountTry;
                    row.Details = finding.Details;
                    row.Title = finding.Title;
                    row.Severity = finding.Severity;
                    if (StateCodes.Contains(finding.Code) && row.Status is "resolved" or "cleared")
                    {
                        row.Status = "open";
                        row.ReviewedAt = null;
                        row.ReviewedByUserId = null;
                        row.ResolutionNote = "Koşul tekrar tespit edildi.";
                    }
                }
                else
                {
                    db.RiskSignals.Add(new RiskSignal
                    {
                        Fingerprint = finding.Fingerprint,
                        Code = finding.Code,
                        Severity = finding.Severity,
                        Status = "open",
                        SubjectUserId = finding.SubjectUserId,
                        DealId = finding.DealId,
                        WalletLedgerId = finding.WalletLedgerId,
                        AmountTry = finding.AmountTry,
                        Title = finding.Title,
                        Details = finding.Details,
                        FirstDetectedAt = now,
                        LastDetectedAt = now
                    });
                    added++;
                }
            }

            var activeStateSignals = await db.RiskSignals
                .Where(x => (x.Status == "open" || x.Status == "reviewing") && StateCodes.Contains(x.Code))
                .ToListAsync(cancellationToken);
            var cleared = 0;
            foreach (var row in activeStateSignals.Where(x => !findings.ContainsKey(x.Fingerprint)))
            {
                row.Status = "cleared";
                row.ReviewedAt = now;
                row.ResolutionNote = "Koşul sonraki bütünlük taramasında görülmedi; otomatik temizlendi.";
                cleared++;
            }

            await UpsertSetting(db, "risk_last_scan_at", now.ToString("O", CultureInfo.InvariantCulture), now, cancellationToken);
            await UpsertSetting(db, "risk_last_scan_findings", findings.Count.ToString(CultureInfo.InvariantCulture), now, cancellationToken);
            await db.SaveChangesAsync(cancellationToken);

            var open = await db.RiskSignals.CountAsync(x => x.Status == "open" || x.Status == "reviewing", cancellationToken);
            var critical = await db.RiskSignals.CountAsync(x => (x.Status == "open" || x.Status == "reviewing") && x.Severity == "critical", cancellationToken);
            return new RiskScanResult(true, findings.Count, added, cleared, critical, open == 0 ? "clean" : "review_required");
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "KOTAKAS risk taraması başarısız oldu.");
            return new RiskScanResult(false, 0, 0, 0, 0, "scan_failed");
        }
        finally
        {
            _gate.Release();
        }
    }

    private static void Add(Dictionary<string, RiskFinding> findings, RiskFinding finding) => findings[finding.Fingerprint] = finding;

    private static decimal Money(decimal value) => Math.Round(value, 2, MidpointRounding.AwayFromZero);

    private static decimal SettingDecimal(IReadOnlyDictionary<string, string> settings, string key, decimal fallback) =>
        settings.TryGetValue(key, out var raw) && decimal.TryParse(raw, NumberStyles.Number, CultureInfo.InvariantCulture, out var value) && value > 0
            ? value
            : fallback;

    private static int SettingInt(IReadOnlyDictionary<string, string> settings, string key, int fallback) =>
        settings.TryGetValue(key, out var raw) && int.TryParse(raw, NumberStyles.Integer, CultureInfo.InvariantCulture, out var value) && value > 0
            ? value
            : fallback;

    private static async Task UpsertSetting(AppDbContext db, string key, string value, DateTimeOffset now, CancellationToken cancellationToken)
    {
        var row = await db.SiteSettings.FirstOrDefaultAsync(x => x.Key == key, cancellationToken);
        if (row is null)
            db.SiteSettings.Add(new SiteSetting { Key = key, Value = value, UpdatedAt = now });
        else
        {
            row.Value = value;
            row.UpdatedAt = now;
        }
    }

    private sealed record RiskFinding(
        string Fingerprint,
        string Code,
        string Severity,
        string? SubjectUserId,
        long? DealId,
        long? WalletLedgerId,
        decimal? AmountTry,
        string Title,
        string Details);
}

public sealed record RiskScanResult(bool Completed, int Findings, int Added, int Cleared, int Critical, string Status);

public sealed class RiskDetectionWorker(RiskDetectionService scanner, ILogger<RiskDetectionWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken);
            while (!stoppingToken.IsCancellationRequested)
            {
                var result = await scanner.ScanNowAsync(stoppingToken);
                if (!result.Completed) logger.LogWarning("KOTAKAS risk taraması tamamlanamadı: {Status}", result.Status);
                await Task.Delay(TimeSpan.FromMinutes(10), stoppingToken);
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
        }
    }
}
