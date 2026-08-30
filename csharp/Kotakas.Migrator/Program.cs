using Kotakas.Web.Data;
using Kotakas.Web.Models;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

var options = ParseArgs(args);
var sqlite = Value("sqlite", "KOTAKAS_MIGRATOR_SQLITE");
var postgres = Value("postgres", "KOTAKAS_MIGRATOR_POSTGRES");
var execute = options.ContainsKey("execute");
var uploadsSource = Value("uploads-source", "KOTAKAS_MIGRATOR_UPLOADS_SOURCE", required: false);
var uploadsTarget = Value("uploads-target", "KOTAKAS_MIGRATOR_UPLOADS_TARGET", required: false);

Console.WriteLine("KOTAKAS SQLite → PostgreSQL Migrator V13");
Console.WriteLine(execute ? "MOD: GERÇEK TAŞIMA" : "MOD: DRY-RUN (veri yazılmaz)");

var sourceOptions = new DbContextOptionsBuilder<AppDbContext>().UseSqlite(sqlite).Options;
// Migrator tek ve kontrollü bir transaction çalıştırır. Production web uygulamasındaki
// retry stratejisini burada kullanmayız; taşıma ya tamamen commit olur ya tamamen rollback.
var targetOptions = new DbContextOptionsBuilder<AppDbContext>().UseNpgsql(postgres).Options;

await using var source = new AppDbContext(sourceOptions) { SuppressAutomation = true };
await using var target = new AppDbContext(targetOptions) { SuppressAutomation = true };

if (!await source.Database.CanConnectAsync()) Fail("SQLite kaynağa bağlanılamadı.");
if (!await target.Database.CanConnectAsync()) Fail("PostgreSQL sunucusuna bağlanılamadı.");

var sourceSummary = await Summary(source);
PrintSummary("KAYNAK", sourceSummary);

if (!execute)
{
    Console.WriteLine("\nDry-run tamam. Gerçek taşıma için aynı komuta --execute ekle.");
    return;
}

// Hedef DB yalnız yeni/boş PostgreSQL olmalıdır. V13'te şema EnsureCreated ile değil,
// versioned EF migrations ile hazırlanır ve __EFMigrationsHistory de doğru şekilde oluşur.
if (await HasBusinessData(target))
    Fail("Hedef PostgreSQL boş değil. Güvenlik nedeniyle taşıma durduruldu. Yeni/boş bir KOTAKAS veritabanı kullan.");
await target.Database.MigrateAsync();
var pending = (await target.Database.GetPendingMigrationsAsync()).ToList();
if (pending.Count != 0) Fail("Hedef PostgreSQL migration tamamlanamadı: " + string.Join(", ", pending));
if (await HasBusinessData(target))
    Fail("Migration sonrasında hedefte beklenmeyen iş verisi bulundu; taşıma durduruldu.");

await using var tx = await target.Database.BeginTransactionAsync();
try
{
    await Copy(source.Roles, target.Roles, target, "Roller");
    await Copy(source.Users, target.Users, target, "Kullanıcılar");
    await Copy(source.RoleClaims, target.RoleClaims, target, "Rol claimleri");
    await Copy(source.UserClaims, target.UserClaims, target, "Kullanıcı claimleri");
    await Copy(source.UserLogins, target.UserLogins, target, "Harici girişler (Google vb.)");
    await Copy(source.UserTokens, target.UserTokens, target, "Kullanıcı token kayıtları");
    await Copy(source.UserRoles, target.UserRoles, target, "Kullanıcı rolleri");

    await Copy(source.SiteSettings, target.SiteSettings, target, "Site ayarları");
    await Copy(source.SaleRequests, target.SaleRequests, target, "Satış talepleri");
    await Copy(source.Offers, target.Offers, target, "Teklifler");
    await Copy(source.TraderApplications, target.TraderApplications, target, "Pazarcı başvuruları");
    await Copy(source.Wallets, target.Wallets, target, "Cüzdanlar");
    await Copy(source.Listings, target.Listings, target, "SELL ilanları");
    await Copy(source.Deals, target.Deals, target, "Anlaşmalar");
    await Copy(source.Notifications, target.Notifications, target, "Bildirimler");
    await Copy(source.WalletLedgers, target.WalletLedgers, target, "Bakiye hareketleri");
    await Copy(source.SupportTickets, target.SupportTickets, target, "Destek kayıtları");
    await Copy(source.SupportReplies, target.SupportReplies, target, "Destek cevapları");
    await Copy(source.DealMessages, target.DealMessages, target, "Hazır işlem mesajları");
    await Copy(source.PaymentIntents, target.PaymentIntents, target, "Ödeme kayıtları");
    await Copy(source.TraderReviews, target.TraderReviews, target, "Pazarcı yorumları");
    await Copy(source.Favorites, target.Favorites, target, "Favoriler");
    await Copy(source.ItemWatches, target.ItemWatches, target, "Item alarmları");
    await Copy(source.UserReports, target.UserReports, target, "Şikâyetler");
    await Copy(source.NotificationPreferences, target.NotificationPreferences, target, "Bildirim tercihleri");
    await Copy(source.VerificationRequests, target.VerificationRequests, target, "Doğrulama talepleri");
    await Copy(source.AdminAuditEvents, target.AdminAuditEvents, target, "Admin audit kayıtları");

    if (await SqliteTableExists(source, "RiskSignals"))
        await Copy(source.RiskSignals, target.RiskSignals, target, "Risk sinyalleri");
    else
        Console.WriteLine("  Risk sinyalleri: 0 (V12 kaynakta tablo yok)");

    // Idempotency kayıtları ve aktif cihaz oturumları bilerek taşınmaz.
    // Canlı geçiş sonrası herkesin yeni sunucuda temiz oturum açması daha güvenlidir.

    var schemaVersion = await target.SiteSettings.FirstOrDefaultAsync(x => x.Key == "schema_version");
    if (schemaVersion is null)
        target.SiteSettings.Add(new SiteSetting { Key = "schema_version", Value = "13", UpdatedAt = DateTimeOffset.UtcNow });
    else
    {
        schemaVersion.Value = "13";
        schemaVersion.UpdatedAt = DateTimeOffset.UtcNow;
    }
    await target.SaveChangesAsync();
    target.ChangeTracker.Clear();

    await ResetPostgresSequences(target);
    var targetSummary = await Summary(target);
    PrintSummary("HEDEF", targetSummary);
    Validate(sourceSummary, targetSummary);

    await tx.CommitAsync();
    Console.WriteLine("\nDB TAŞIMA BAŞARILI. Finans toplamları ve temel kayıt adetleri eşleşti. PostgreSQL schema V13 migration geçmişi güncel.");
}
catch
{
    await tx.RollbackAsync();
    throw;
}

if (!string.IsNullOrWhiteSpace(uploadsSource) && !string.IsNullOrWhiteSpace(uploadsTarget))
{
    var count = CopyUploads(uploadsSource, uploadsTarget);
    Console.WriteLine($"Item görselleri kopyalandı: {count} dosya");
}
else
{
    Console.WriteLine("Item görselleri taşınmadı. İstersen --uploads-source ve --uploads-target ver.");
}

Dictionary<string, string?> ParseArgs(string[] values)
{
    var map = new Dictionary<string, string?>(StringComparer.OrdinalIgnoreCase);
    for (var i = 0; i < values.Length; i++)
    {
        var arg = values[i];
        if (!arg.StartsWith("--")) continue;
        var key = arg[2..];
        if (key.Contains('='))
        {
            var parts = key.Split('=', 2);
            map[parts[0]] = parts[1];
        }
        else if (i + 1 < values.Length && !values[i + 1].StartsWith("--")) map[key] = values[++i];
        else map[key] = "true";
    }
    return map;
}

string Value(string key, string env, bool required = true)
{
    var value = options.TryGetValue(key, out var v) ? v : Environment.GetEnvironmentVariable(env);
    if (required && string.IsNullOrWhiteSpace(value)) Fail($"Eksik ayar: --{key} veya {env}");
    return value ?? "";
}

static async Task<int> Copy<T>(DbSet<T> from, DbSet<T> to, AppDbContext targetDb, string label) where T : class
{
    var rows = await from.AsNoTracking().ToListAsync();
    if (rows.Count > 0)
    {
        to.AddRange(rows);
        await targetDb.SaveChangesAsync();
        targetDb.ChangeTracker.Clear();
    }
    Console.WriteLine($"  {label}: {rows.Count}");
    return rows.Count;
}

static async Task<DbSummary> Summary(AppDbContext db)
{
    // SQLite decimal SUM çevirisini desteklemez. Provider bağımsız doğrulama için
    // finans değerlerini satır bazında okuyup toplamı uygulama tarafında hesaplarız.
    var walletBalances = await db.Wallets.AsNoTracking().Select(x => x.BalanceTry).ToListAsync();
    var dealAmounts = await db.Deals.AsNoTracking()
        .Select(x => new { x.Status, x.EscrowTry, x.GrossTry })
        .ToListAsync();

    return new DbSummary(
        await db.Users.CountAsync(),
        await db.SaleRequests.CountAsync(),
        await db.Offers.CountAsync(),
        await db.Listings.CountAsync(),
        dealAmounts.Count,
        walletBalances.Count,
        await db.WalletLedgers.CountAsync(),
        await db.TraderReviews.CountAsync(),
        await db.Favorites.CountAsync(),
        walletBalances.Sum(),
        dealAmounts.Sum(x => x.EscrowTry),
        dealAmounts.Where(x => x.Status == "completed").Sum(x => x.GrossTry));
}

static void PrintSummary(string title, DbSummary s)
{
    Console.WriteLine($"\n{title} ÖZETİ");
    Console.WriteLine($"  Kullanıcı: {s.Users} | Talep: {s.Requests} | Teklif: {s.Offers} | SELL: {s.Listings} | Anlaşma: {s.Deals}");
    Console.WriteLine($"  Cüzdan: {s.Wallets} | Ledger: {s.Ledgers} | Yorum: {s.Reviews} | Favori: {s.Favorites}");
    Console.WriteLine($"  Cüzdan toplamı: {s.WalletBalance:0.00} TL | Aktif escrow: {s.Escrow:0.00} TL | Tamamlanan hacim: {s.CompletedVolume:0.00} TL");
}

static void Validate(DbSummary a, DbSummary b)
{
    if (a.Users != b.Users || a.Requests != b.Requests || a.Offers != b.Offers || a.Listings != b.Listings ||
        a.Deals != b.Deals || a.Wallets != b.Wallets || a.Ledgers != b.Ledgers || a.Reviews != b.Reviews || a.Favorites != b.Favorites)
        Fail("Kayıt adetleri eşleşmedi; transaction geri alınacak.");
    if (a.WalletBalance != b.WalletBalance || a.Escrow != b.Escrow || a.CompletedVolume != b.CompletedVolume)
        Fail("Finans toplamları eşleşmedi; transaction geri alınacak.");
}

static async Task<bool> HasBusinessData(AppDbContext db)
{
    // Fresh PostgreSQL databases have no application tables yet. Do not query DbSets until
    // migrations have created AspNetUsers; otherwise the safety check itself would fail.
    if (db.Database.IsNpgsql() && !await PostgresTableExists(db, "AspNetUsers")) return false;
    return await db.Users.AnyAsync() || await db.Deals.AnyAsync() || await db.WalletLedgers.AnyAsync() || await db.SaleRequests.AnyAsync();
}

static async Task<bool> PostgresTableExists(AppDbContext db, string tableName)
{
    var connection = db.Database.GetDbConnection();
    if (connection.State != System.Data.ConnectionState.Open) await connection.OpenAsync();
    await using var command = connection.CreateCommand();
    command.CommandText = "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = @name);";
    var parameter = command.CreateParameter();
    parameter.ParameterName = "@name";
    parameter.Value = tableName;
    command.Parameters.Add(parameter);
    var value = await command.ExecuteScalarAsync();
    return value is bool exists && exists;
}

static async Task<bool> SqliteTableExists(AppDbContext db, string tableName)
{
    var connection = db.Database.GetDbConnection();
    if (connection.State != System.Data.ConnectionState.Open) await connection.OpenAsync();
    await using var command = connection.CreateCommand();
    command.CommandText = "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=$name;";
    var parameter = command.CreateParameter();
    parameter.ParameterName = "$name";
    parameter.Value = tableName;
    command.Parameters.Add(parameter);
    var value = await command.ExecuteScalarAsync();
    return Convert.ToInt64(value ?? 0) > 0;
}

static async Task ResetPostgresSequences(AppDbContext db)
{
    var tables = new[]
    {
        "AspNetRoleClaims", "AspNetUserClaims", "SaleRequests", "Offers", "Deals", "Notifications",
        "TraderApplications", "Wallets", "Listings", "WalletLedgers", "SupportTickets", "SupportReplies",
        "DealMessages", "PaymentIntents", "TraderReviews", "Favorites", "ItemWatches", "UserReports",
        "VerificationRequests", "AdminAuditEvents", "RiskSignals"
    };
    foreach (var table in tables)
    {
        var quotedTable = $"\"{table}\"";
        var sql = $"SELECT setval(pg_get_serial_sequence('{quotedTable}', 'Id'), COALESCE(MAX(\"Id\"), 1), MAX(\"Id\") IS NOT NULL) FROM {quotedTable};";
        await db.Database.ExecuteSqlRawAsync(sql);
    }
}

static int CopyUploads(string sourceDir, string targetDir)
{
    if (!Directory.Exists(sourceDir))
    {
        Console.WriteLine("UYARI: uploads kaynak klasörü bulunamadı.");
        return 0;
    }
    Directory.CreateDirectory(targetDir);
    var count = 0;
    foreach (var file in Directory.EnumerateFiles(sourceDir, "*", SearchOption.TopDirectoryOnly))
    {
        File.Copy(file, Path.Combine(targetDir, Path.GetFileName(file)), overwrite: false);
        count++;
    }
    return count;
}

static void Fail(string message) => throw new InvalidOperationException(message);

record DbSummary(
    int Users,
    int Requests,
    int Offers,
    int Listings,
    int Deals,
    int Wallets,
    int Ledgers,
    int Reviews,
    int Favorites,
    decimal WalletBalance,
    decimal Escrow,
    decimal CompletedVolume);
