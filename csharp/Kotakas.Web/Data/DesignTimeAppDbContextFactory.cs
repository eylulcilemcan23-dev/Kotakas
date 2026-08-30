using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Kotakas.Web.Data;

public sealed class DesignTimeAppDbContextFactory : IDesignTimeDbContextFactory<AppDbContext>
{
    public AppDbContext CreateDbContext(string[] args)
    {
        var provider = (Environment.GetEnvironmentVariable("KOTAKAS_EF_PROVIDER") ?? "postgres").Trim().ToLowerInvariant();
        var options = new DbContextOptionsBuilder<AppDbContext>();

        if (provider is "postgres" or "postgresql")
        {
            var connection = Environment.GetEnvironmentVariable("KOTAKAS_EF_CONNECTION")
                ?? "Host=127.0.0.1;Port=5432;Database=kotakas_design;Username=postgres;Password=postgres";
            options.UseNpgsql(connection);
        }
        else if (provider == "sqlite")
        {
            var connection = Environment.GetEnvironmentVariable("KOTAKAS_EF_CONNECTION")
                ?? "Data Source=App_Data/kotakas-design.db";
            options.UseSqlite(connection);
        }
        else
        {
            throw new InvalidOperationException($"Desteklenmeyen KOTAKAS_EF_PROVIDER: {provider}");
        }

        return new AppDbContext(options.Options) { SuppressAutomation = true };
    }
}
