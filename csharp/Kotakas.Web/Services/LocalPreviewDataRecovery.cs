using Microsoft.AspNetCore.Builder;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Configuration;

namespace Kotakas.Web.Services;

public static class LocalPreviewDataRecovery
{
    private const string MarkerName = ".v61-smart-imported";

    public static void TryRecover(WebApplicationBuilder builder)
    {
        try
        {
            if (!builder.Environment.IsDevelopment()) return;
            var provider = (builder.Configuration["Database:Provider"] ?? "sqlite").Trim().ToLowerInvariant();
            if (provider != "sqlite") return;

            var connectionString = builder.Configuration.GetConnectionString("Default") ?? "Data Source=App_Data/kotakas.db";
            var csb = new SqliteConnectionStringBuilder(connectionString);
            var currentDb = csb.DataSource;
            if (string.IsNullOrWhiteSpace(currentDb)) return;
            if (!Path.IsPathRooted(currentDb))
                currentDb = Path.GetFullPath(Path.Combine(builder.Environment.ContentRootPath, currentDb));

            var dataDir = Path.GetDirectoryName(currentDb)!;
            Directory.CreateDirectory(dataDir);
            var marker = Path.Combine(dataDir, MarkerName);
            if (File.Exists(marker)) return;

            var current = File.Exists(currentDb) ? Analyze(currentDb) : null;
            if (current is { GbBalance: > 0 })
            {
                File.WriteAllText(marker, $"Mevcut veritabanı zaten GB stoğu içeriyor.\r\nTarih: {DateTimeOffset.Now:o}");
                return;
            }

            var candidates = DiscoverCandidates(builder.Environment.ContentRootPath, currentDb)
                .Select(Analyze)
                .Where(x => x is not null)
                .Cast<DbCandidate>()
                .OrderByDescending(x => x.Score)
                .ThenByDescending(x => x.LastWriteTimeUtc)
                .ToList();

            var best = candidates.FirstOrDefault();
            if (best is null || best.Score <= 0) return;
            if (current is not null && best.Score <= current.Score) return;

            if (File.Exists(currentDb))
            {
                var backup = currentDb + ".v61-before-" + DateTime.Now.ToString("yyyyMMdd-HHmmss") + ".bak";
                File.Copy(currentDb, backup, overwrite: true);
            }

            BackupSqlite(best.Path, currentDb);
            CopyUploads(best.Path, builder.Environment.ContentRootPath);

            File.WriteAllText(marker,
                $"Kaynak: {best.Path}\r\n" +
                $"Kullanıcı: {best.Users}\r\n" +
                $"Paket siparişi: {best.TraderPackageOrders}\r\n" +
                $"KOTAKAS item: {best.Inventory}\r\n" +
                $"Item siparişi: {best.ItemOrders}\r\n" +
                $"GB stoğu: {best.GbBalance:0.##}\r\n" +
                $"Tarih: {DateTimeOffset.Now:o}\r\n");

            Console.WriteLine($"[KOTAKAS V6.1] En dolu yerel veritabanı otomatik alındı: {best.Path}");
            Console.WriteLine($"[KOTAKAS V6.1] GB stoğu: {best.GbBalance:0.##} GB | kullanıcı: {best.Users} | item siparişi: {best.ItemOrders}");
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[KOTAKAS V6.1] Otomatik veri kurtarma atlandı: {ex.Message}");
        }
    }

    private static IEnumerable<string> DiscoverCandidates(string contentRoot, string currentDb)
    {
        var packageRoot = Directory.GetParent(contentRoot)?.FullName ?? contentRoot;
        var siblingRoot = Directory.GetParent(packageRoot)?.FullName;
        var roots = new[]
        {
            siblingRoot,
            packageRoot,
            Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads"),
            Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments)
        }
        .Where(x => !string.IsNullOrWhiteSpace(x) && Directory.Exists(x))
        .Select(Path.GetFullPath)
        .Distinct(StringComparer.OrdinalIgnoreCase)
        .ToArray();

        var found = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var root in roots)
        {
            foreach (var file in SafeWalk(root!))
            {
                var name = Path.GetFileName(file);
                if (!name.Equals("kotakas-preview.db", StringComparison.OrdinalIgnoreCase) &&
                    !name.Equals("kotakas.db", StringComparison.OrdinalIgnoreCase))
                    continue;

                var full = Path.GetFullPath(file);
                if (full.Equals(currentDb, StringComparison.OrdinalIgnoreCase)) continue;
                if (full.Contains("selftest", StringComparison.OrdinalIgnoreCase)) continue;
                if (found.Add(full)) yield return full;
            }
        }
    }

    private static IEnumerable<string> SafeWalk(string root)
    {
        var stack = new Stack<string>();
        stack.Push(root);
        while (stack.Count > 0)
        {
            var dir = stack.Pop();
            string[] files;
            try { files = Directory.GetFiles(dir, "*.db", SearchOption.TopDirectoryOnly); }
            catch { files = Array.Empty<string>(); }
            foreach (var file in files) yield return file;

            string[] dirs;
            try { dirs = Directory.GetDirectories(dir); }
            catch { dirs = Array.Empty<string>(); }
            foreach (var child in dirs)
            {
                var n = Path.GetFileName(child);
                if (n.Equals("bin", StringComparison.OrdinalIgnoreCase) ||
                    n.Equals("obj", StringComparison.OrdinalIgnoreCase) ||
                    n.Equals("node_modules", StringComparison.OrdinalIgnoreCase) ||
                    n.Equals(".git", StringComparison.OrdinalIgnoreCase))
                    continue;
                stack.Push(child);
            }
        }
    }

    private static DbCandidate? Analyze(string path)
    {
        try
        {
            var cs = new SqliteConnectionStringBuilder
            {
                DataSource = path,
                Mode = SqliteOpenMode.ReadOnly,
                Cache = SqliteCacheMode.Private
            }.ToString();
            using var conn = new SqliteConnection(cs);
            conn.Open();

            var users = Count(conn, "AspNetUsers");
            var packages = Count(conn, "TraderPackageOrders");
            var inventory = Count(conn, "KotakasInventory");
            var orders = Count(conn, "KotakasItemOrders");
            var gb = Sum(conn, "KotakasGbStock", "BalanceGb");

            // Yeni iş modelindeki gerçek operasyon verileri ağır basar. Böylece sadece
            // dosya tarihi yeni diye boş/eskimiş bir DB seçilmez.
            var score =
                (gb > 0 ? 10_000_000d + (double)gb * 100_000d : 0d) +
                orders * 100_000d +
                inventory * 50_000d +
                packages * 10_000d +
                users * 1_000d;

            return new DbCandidate(path, score, users, packages, inventory, orders, gb, File.GetLastWriteTimeUtc(path));
        }
        catch
        {
            return null;
        }
    }

    private static long Count(SqliteConnection conn, string table)
    {
        if (!TableExists(conn, table)) return 0;
        using var cmd = conn.CreateCommand();
        cmd.CommandText = $"SELECT COUNT(*) FROM \"{table}\"";
        return Convert.ToInt64(cmd.ExecuteScalar() ?? 0L);
    }

    private static decimal Sum(SqliteConnection conn, string table, string column)
    {
        if (!TableExists(conn, table)) return 0m;
        using var cmd = conn.CreateCommand();
        cmd.CommandText = $"SELECT COALESCE(SUM(\"{column}\"),0) FROM \"{table}\"";
        return Convert.ToDecimal(cmd.ExecuteScalar() ?? 0m);
    }

    private static bool TableExists(SqliteConnection conn, string table)
    {
        using var cmd = conn.CreateCommand();
        cmd.CommandText = "SELECT 1 FROM sqlite_master WHERE type='table' AND name=$name LIMIT 1";
        cmd.Parameters.AddWithValue("$name", table);
        return cmd.ExecuteScalar() is not null;
    }

    private static void BackupSqlite(string sourcePath, string destinationPath)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(destinationPath)!);
        if (File.Exists(destinationPath)) File.Delete(destinationPath);

        var sourceCs = new SqliteConnectionStringBuilder
        {
            DataSource = sourcePath,
            Mode = SqliteOpenMode.ReadOnly,
            Cache = SqliteCacheMode.Private
        }.ToString();
        var destinationCs = new SqliteConnectionStringBuilder
        {
            DataSource = destinationPath,
            Mode = SqliteOpenMode.ReadWriteCreate,
            Cache = SqliteCacheMode.Private
        }.ToString();

        using var source = new SqliteConnection(sourceCs);
        using var destination = new SqliteConnection(destinationCs);
        source.Open();
        destination.Open();
        source.BackupDatabase(destination);
    }

    private static void CopyUploads(string sourceDb, string newContentRoot)
    {
        try
        {
            var sourceData = Path.GetDirectoryName(sourceDb);
            var sourceWebRoot = sourceData is null ? null : Directory.GetParent(sourceData)?.FullName;
            if (sourceWebRoot is null) return;
            var sourceUploads = Path.Combine(sourceWebRoot, "wwwroot", "uploads");
            var destinationUploads = Path.Combine(newContentRoot, "wwwroot", "uploads");
            if (!Directory.Exists(sourceUploads)) return;
            CopyDirectory(sourceUploads, destinationUploads);
        }
        catch { }
    }

    private static void CopyDirectory(string source, string destination)
    {
        Directory.CreateDirectory(destination);
        foreach (var file in Directory.GetFiles(source))
            File.Copy(file, Path.Combine(destination, Path.GetFileName(file)), overwrite: true);
        foreach (var dir in Directory.GetDirectories(source))
            CopyDirectory(dir, Path.Combine(destination, Path.GetFileName(dir)));
    }

    private sealed record DbCandidate(
        string Path,
        double Score,
        long Users,
        long TraderPackageOrders,
        long Inventory,
        long ItemOrders,
        decimal GbBalance,
        DateTime LastWriteTimeUtc);
}
