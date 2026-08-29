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

builder.Services.AddDbContext<AppDbContext>(o =>
    o.UseSqlite(builder.Configuration.GetConnectionString("Default") ?? "Data Source=App_Data/kotakas.db"));

builder.Services.AddIdentity<ApplicationUser, IdentityRole>(o =>
{
    o.User.RequireUniqueEmail = true;
    o.Password.RequiredLength = 8;
    o.Password.RequireUppercase = false;
    o.Password.RequireLowercase = false;
    o.Password.RequireDigit = false;
    o.Password.RequireNonAlphanumeric = false;
    o.Lockout.MaxFailedAccessAttempts = 8;
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
    o.Cookie.SecurePolicy = CookieSecurePolicy.SameAsRequest;
    o.LoginPath = "/login.html";
    o.AccessDeniedPath = "/login.html";
    o.SlidingExpiration = true;
    o.ExpireTimeSpan = TimeSpan.FromDays(7);
    o.Events.OnRedirectToLogin = ctx => RedirectApi(ctx, 401);
    o.Events.OnRedirectToAccessDenied = ctx => RedirectApi(ctx, 403);
});

builder.Services.AddAuthorization();
builder.Services.AddHttpClient();
builder.Services.AddHostedService<MarketRateSyncService>();

var app = builder.Build();
await StartupSeeder.InitializeAsync(app);

app.UseDefaultFiles();
app.UseStaticFiles();
app.UseAuthentication();
app.UseAuthorization();

app.MapHealthEndpoints();
app.MapAuthEndpoints();
app.MapAccountEndpoints();
app.MapMarketplaceEndpoints();
app.MapRequestManagementEndpoints();
app.MapListingManagementEndpoints();
app.MapUploadEndpoints();
app.MapDealEndpoints();
app.MapReviewEndpoints();
app.MapSupportEndpoints();
app.MapAdminEndpoints();
app.MapAdminModerationEndpoints();
app.MapIntegrationEndpoints();
app.MapPaymentEndpoints();
app.MapFallbackToFile("index.html");
app.Run();

static Task RedirectApi(RedirectContext<CookieAuthenticationOptions> ctx, int code)
{
    if (ctx.Request.Path.StartsWithSegments("/api")) { ctx.Response.StatusCode = code; return Task.CompletedTask; }
    ctx.Response.Redirect(ctx.RedirectUri); return Task.CompletedTask;
}
