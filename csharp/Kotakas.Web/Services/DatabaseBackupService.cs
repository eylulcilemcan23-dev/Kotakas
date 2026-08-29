using System.IO.Compression;
using Microsoft.Data.Sqlite;

namespace Kotakas.Web.Services;

public sealed class DatabaseBackupService(
    IConfiguration configuration,
    IWebHostEnvironment environment,
    ILogger<DatabaseBackupService> logger) : BackgroundService
{
    private readonly SemaphoreSlim _gate = new(1, 1);
    private string BackupDirectory => Path.Combine(environment.ContentRootPath, "App_Data", "backups");
    public string Provider => (configuration["Database:Provider"] ?? "sqlite").Trim().ToLowerInvariant();
    public bool SupportsInAppBackup => Provider == "sqlite";

    public sealed record BackupInfo(string FileName, long SizeBytes, DateTimeOffset CreatedAt);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!SupportsInAppBackup)
        {
            logger.LogInformation("KOTAKAS uygulama içi DB backup devre dışı: provider={Provider}. PostgreSQL için pg_dump/managed snapshot kullanılmalı.", Provider);
            return;
        }

        Directory.CreateDirectory(BackupDirectory);
        try { await Task.Delay(TimeSpan.FromMinutes(10), stoppingToken); } catch (OperationCanceledException) { return; }
        while (!stoppingToken.IsCancellationRequested)
        {
            try { await CreateBackupAsync(stoppingToken); }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            catch (Exception ex) { logger.LogError(ex, "Otomatik KOTAKAS yedeği oluşturulamadı."); }
            try { await Task.Delay(TimeSpan.FromHours(24), stoppingToken); } catch (OperationCanceledException) { break; }
        }
    }

    public async Task<BackupInfo> CreateBackupAsync(CancellationToken cancellationToken = default)
    {
        if (!SupportsInAppBackup)
            throw new NotSupportedException("PostgreSQL kullanılırken uygulama içi SQLite yedeği oluşturulmaz. pg_dump veya managed PostgreSQL snapshot yapılandırılmalıdır.");

        await _gate.WaitAsync(cancellationToken);
        try
        {
            Directory.CreateDirectory(BackupDirectory);
            var cs = configuration.GetConnectionString("Default") ?? "Data Source=App_Data/kotakas.db";
            var stamp = DateTimeOffset.UtcNow.ToString("yyyyMMdd-HHmmss");
            var tempDb = Path.Combine(BackupDirectory, $".kotakas-{stamp}.db");
            var zipPath = Path.Combine(BackupDirectory, $"kotakas-backup-{stamp}.zip");
            try
            {
                await using (var source = new SqliteConnection(cs))
                await using (var target = new SqliteConnection($"Data Source={tempDb}"))
                {
                    await source.OpenAsync(cancellationToken);
                    await target.OpenAsync(cancellationToken);
                    source.BackupDatabase(target);
                }

                using (var zip = ZipFile.Open(zipPath, ZipArchiveMode.Create))
                {
                    zip.CreateEntryFromFile(tempDb, "database/kotakas.db", CompressionLevel.Optimal);
                    var uploads = Path.Combine(environment.WebRootPath ?? Path.Combine(environment.ContentRootPath, "wwwroot"), "uploads", "requests");
                    if (Directory.Exists(uploads))
                    {
                        foreach (var file in Directory.EnumerateFiles(uploads, "*", SearchOption.TopDirectoryOnly))
                        {
                            cancellationToken.ThrowIfCancellationRequested();
                            zip.CreateEntryFromFile(file, $"uploads/requests/{Path.GetFileName(file)}", CompressionLevel.Fastest);
                        }
                    }
                }
            }
            finally
            {
                if (File.Exists(tempDb)) File.Delete(tempDb);
            }

            CleanupOldBackups(14);
            var info = new FileInfo(zipPath);
            logger.LogInformation("KOTAKAS backup oluşturuldu: {FileName} ({Size} bytes)", info.Name, info.Length);
            return new BackupInfo(info.Name, info.Length, new DateTimeOffset(info.CreationTimeUtc));
        }
        finally
        {
            _gate.Release();
        }
    }

    public IReadOnlyList<BackupInfo> ListBackups() => Directory.Exists(BackupDirectory)
        ? Directory.EnumerateFiles(BackupDirectory, "kotakas-backup-*.zip")
            .Select(x => new FileInfo(x))
            .OrderByDescending(x => x.CreationTimeUtc)
            .Take(50)
            .Select(x => new BackupInfo(x.Name, x.Length, new DateTimeOffset(x.CreationTimeUtc)))
            .ToList()
        : [];

    private void CleanupOldBackups(int keep)
    {
        var files = Directory.EnumerateFiles(BackupDirectory, "kotakas-backup-*.zip")
            .Select(x => new FileInfo(x)).OrderByDescending(x => x.CreationTimeUtc).ToList();
        foreach (var file in files.Skip(keep))
        {
            try { file.Delete(); } catch (Exception ex) { logger.LogWarning(ex, "Eski backup silinemedi: {File}", file.Name); }
        }
    }
}
