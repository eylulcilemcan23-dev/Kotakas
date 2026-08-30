using Kotakas.Web.Api;
using Kotakas.Web.Data;
using Kotakas.Web.Models;
using Kotakas.Web.Services;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);
Directory.CreateDirectory(Path.Combine(builder.Environment.ContentRootPath, "App_Data"));
Directory.CreateDirectory(Path.Combine(builder.Environment.ContentRootPath, "wwwroot", "uploads", "requests"));

var databaseProvider = (builder.Configuration["Database:Provider"] ?? "sqlite").Trim().ToLowerInvariant();
builder.Services.AddDbContext<AppDbContext>(options =>
{
    switch (databaseProvider)
    {
        case "sqlite":
            options.UseSqlite(builder.Configuration.GetConnectionString("Default") ?? "Data Source=App_Data/kotakas.db");
            break;
        case "postgres":
        case "postgresql":
            var postgres = builder.Configuration.GetConnectionString("Postgres")
                ?? builder.Configuration.GetConnectionString("Default");
            if (string.IsNullOrWhiteSpace(postgres))
                throw new InvalidOperationException("PostgreSQL seçildi ancak ConnectionStrings:Postgres ayarlanmadı.");
            options.UseNpgsql(postgres, npgsql => npgsql.EnableRetryOnFailure(5, TimeSpan.FromSeconds(5), null));
            break;
        default:
            throw new InvalidOperationException($"Desteklenmeyen Database:Provider: {databaseProvider}");
    }
});

builder.Services.AddIdentity<ApplicationUser, IdentityRole>(o =>
{
    o.User.RequireUniqueEmail = true;
    o.Password.RequiredLength = 10;
    o.Password.RequireUppercase = false;
    o.Password.RequireLowercase = false;
    o.Password.RequireDigit = true;
    o.Password.RequireNonAlphanumeric = false;
    o.Lockout.MaxFailedAccessAttempts = 5;
    o.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(15);
    o.Lockout.AllowedForNewUsers = true;
})
.AddEntityFrameworkStores<AppDbContext>()
.AddDefaultTokenProviders();

var googleClientId = builder.Configuration["Authentication:Google:ClientId"]?.Trim();
var googleClientSecret = builder.Configuration["Authentication:Google:ClientSecret"]?.Trim();
if (!string.IsNullOrWhiteSpace(googleClientId) && !string.IsNullOrWhiteSpace(googleClientSecret))
{
    builder.Services.AddAuthentication().AddGoogle("Google", o =>
    {
        o.ClientId = googleClientId;
        o.ClientSecret = googleClientSecret;
        o.SaveTokens = false;
    });
}

builder.Services.ConfigureApplicationCookie(o =>
{
    o.Cookie.Name = "kotakas.sid";
    o.Cookie.HttpOnly = true;
    o.Cookie.SameSite = SameSiteMode.Lax;
    o.Cookie.SecurePolicy = builder.Environment.IsProduction() ? CookieSecurePolicy.Always : CookieSecurePolicy.SameAsRequest;
    o.LoginPath = "/login.html";
    o.AccessDeniedPath = "/login.html";
    o.SlidingExpiration = true;
    o.ExpireTimeSpan = TimeSpan.FromDays(3);
    o.Events.OnRedirectToLogin = ctx => RedirectApi(ctx, 401);
    o.Events.OnRedirectToAccessDenied = ctx => RedirectApi(ctx, 403);
});

builder.Services.AddAuthorization();
builder.Services.AddHttpClient();
builder.Services.AddSingleton<KotakasEmailSender>();
builder.Services.AddKotakasSecurity();
builder.Services.AddSingleton<DatabaseBackupService>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<DatabaseBackupService>());
builder.Services.AddHostedService<MarketRateSyncService>();
builder.Services.AddHostedService<MarketplaceMaintenanceService>();
builder.Services.AddSingleton<RiskDetectionService>();
builder.Services.AddHostedService<RiskDetectionWorker>();

var app = builder.Build();
if (databaseProvider is "postgres" or "postgresql")
{
    await PostgresStartupSeeder.InitializeAsync(app);
}
else
{
    await StartupSeeder.InitializeAsync(app);
    await StartupFeatureSeeder.InitializeAsync(app);
}
await SchemaVersionSeeder.InitializeAsync(app);

if (app.Environment.IsProduction())
{
    app.UseHsts();
    app.UseHttpsRedirection();
}
app.UseMiddleware<SecurityHeadersMiddleware>();
app.UseDefaultFiles();
app.UseStaticFiles();
app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();
app.UseMiddleware<SessionSecurityMiddleware>();
app.UseMiddleware<CsrfProtectionMiddleware>();
app.UseMiddleware<CriticalRequestGuardMiddleware>();
app.UseMiddleware<AdminAuditMiddleware>();
app.UseMiddleware<TraderAvailabilityMiddleware>();

app.MapHealthEndpoints();
app.MapAuthEndpoints();
app.MapAccountEndpoints();
app.MapSessionEndpoints();
app.MapMarketplaceEndpoints();
app.MapRequestManagementEndpoints();
app.MapListingManagementEndpoints();
app.MapUploadEndpoints();
app.MapDealEndpoints();
app.MapReviewEndpoints();
app.MapTraderProfileEndpoints();
app.MapTraderRealtimeEndpoints();
app.MapFavoriteEndpoints();
app.MapItemWatchEndpoints();
app.MapVerificationEndpoints();
app.MapNotificationPreferenceEndpoints();
app.MapReportEndpoints();
app.MapSupportEndpoints();
app.MapSupportCenterEndpoints();
app.MapAdminEndpoints();
app.MapAdminModerationEndpoints();
app.MapAdminSearchEndpoints();
app.MapAdminAuditEndpoints();
app.MapAdminRiskEndpoints();
app.MapBackupEndpoints();
app.MapFinanceReportingEndpoints();
app.MapIntegrationEndpoints();
app.MapPaymentEndpoints();
app.MapFallbackToFile("index.html");
app.Run();

static Task RedirectApi(RedirectContext<CookieAuthenticationOptions> ctx, int code)
{
    if (ctx.Request.Path.StartsWithSegments("/api"))
    {
        ctx.Response.StatusCode = code;
        return Task.CompletedTask;
    }
    ctx.Response.Redirect(ctx.RedirectUri);
    return Task.CompletedTask;
}
