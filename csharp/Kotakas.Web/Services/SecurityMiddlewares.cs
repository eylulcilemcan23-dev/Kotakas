using Kotakas.Web.Api;
using Kotakas.Web.Data;
using Microsoft.EntityFrameworkCore;

namespace Kotakas.Web.Services;

public sealed class SecurityHeadersMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(HttpContext context)
    {
        var h = context.Response.Headers;
        h["X-Content-Type-Options"] = "nosniff";
        h["Referrer-Policy"] = "strict-origin-when-cross-origin";
        h["X-Frame-Options"] = "DENY";
        h["Permissions-Policy"] = "camera=(), microphone=(), geolocation=(), payment=(self)";
        h["Cross-Origin-Opener-Policy"] = "same-origin";
        h["Cross-Origin-Resource-Policy"] = "same-origin";
        h["Content-Security-Policy"] = "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'; img-src 'self' data: blob:; connect-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; form-action 'self' https://*.iyzico.com https://*.iyzipay.com";
        await next(context);
    }
}

public sealed class CsrfProtectionMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(HttpContext context)
    {
        var req = context.Request;
        if (!req.Path.StartsWithSegments("/api") || HttpMethods.IsGet(req.Method) || HttpMethods.IsHead(req.Method) || HttpMethods.IsOptions(req.Method))
        {
            await next(context);
            return;
        }

        if (string.Equals(req.Path.Value, "/api/payments/iyzico/callback", StringComparison.OrdinalIgnoreCase))
        {
            await next(context);
            return;
        }

        var headerOk = string.Equals(req.Headers["X-KOTAKAS-CSRF"], "1", StringComparison.Ordinal);
        var fetchSite = req.Headers["Sec-Fetch-Site"].ToString();
        var browserSameSite = fetchSite is "same-origin" or "same-site" or "none";
        var originOk = true;
        var origin = req.Headers.Origin.ToString();
        if (!string.IsNullOrWhiteSpace(origin) && Uri.TryCreate(origin, UriKind.Absolute, out var originUri))
            originOk = string.Equals(originUri.Host, req.Host.Host, StringComparison.OrdinalIgnoreCase);

        if ((!headerOk && !browserSameSite) || !originOk)
        {
            context.Response.StatusCode = StatusCodes.Status403Forbidden;
            context.Response.ContentType = "application/json; charset=utf-8";
            await context.Response.WriteAsJsonAsync(new { error = "csrf_validation_failed" });
            return;
        }

        await next(context);
    }
}

public sealed class CriticalRequestGuardMiddleware(RequestDelegate next)
{
    private static readonly SemaphoreSlim LocalCommerceLock = new(1, 1);

    public async Task InvokeAsync(HttpContext context, AppDbContext db)
    {
        if (!IsCritical(context.Request))
        {
            await next(context);
            return;
        }

        var uid = ApiHelpers.UserId(context.User);
        if (string.IsNullOrWhiteSpace(uid))
        {
            await next(context);
            return;
        }

        var key = context.Request.Headers["Idempotency-Key"].ToString().Trim();
        if (key.Length is < 8 or > 120)
        {
            context.Response.StatusCode = StatusCodes.Status400BadRequest;
            await context.Response.WriteAsJsonAsync(new { error = "idempotency_key_required" });
            return;
        }

        var idempotencyScope = $"{context.Request.Method}:{context.Request.Path}";
        var localLocked = false;
        PostgresAdvisoryLease? pgLease = null;
        try
        {
            if (db.Database.IsNpgsql())
            {
                pgLease = await PostgresAdvisoryLease.AcquireAsync(db, DistributedScope(context.Request, uid), context.RequestAborted);
            }
            else
            {
                await LocalCommerceLock.WaitAsync(context.RequestAborted);
                localLocked = true;
            }

            var exists = await db.IdempotencyRecords.AsNoTracking()
                .AnyAsync(x => x.UserId == uid && x.Scope == idempotencyScope && x.RequestKey == key, context.RequestAborted);
            if (exists)
            {
                context.Response.StatusCode = StatusCodes.Status409Conflict;
                await context.Response.WriteAsJsonAsync(new { error = "duplicate_request" }, context.RequestAborted);
                return;
            }

            db.IdempotencyRecords.Add(new Models.IdempotencyRecord
            {
                UserId = uid,
                Scope = idempotencyScope,
                RequestKey = key,
                CreatedAt = DateTimeOffset.UtcNow
            });
            await db.SaveChangesAsync(context.RequestAborted);
            await next(context);
        }
        finally
        {
            if (pgLease is not null) await pgLease.DisposeAsync();
            if (localLocked) LocalCommerceLock.Release();
        }
    }

    private static string DistributedScope(HttpRequest request, string uid)
    {
        var path = request.Path.Value?.ToLowerInvariant() ?? "";
        var parts = path.Split('/', StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length >= 4 && parts[0] == "api" && parts[1] == "listings" && parts[^1] == "buy")
            return $"kotakas:listing:{parts[2]}";
        if (parts.Length >= 4 && parts[0] == "api" && parts[1] == "listing-price-offers" && parts[^1] == "purchase")
            return $"kotakas:listing-price-offer:{parts[2]}";
        if (parts.Length >= 4 && parts[0] == "api" && parts[1] == "deals")
            return $"kotakas:deal:{parts[2]}";
        if (parts.Length >= 4 && parts[0] == "api" && parts[1] == "offers" && parts[^1] == "accept")
            return "kotakas:offer-accept";
        if (path == "/api/sale-requests" || path == "/api/listings" || path.StartsWith("/api/payments/paid-listing"))
            return $"kotakas:{path}:{uid}";
        return $"kotakas:{path}";
    }

    private static bool IsCritical(HttpRequest request)
    {
        if (!HttpMethods.IsPost(request.Method) && !HttpMethods.IsPatch(request.Method) && !HttpMethods.IsDelete(request.Method)) return false;
        var path = request.Path.Value?.ToLowerInvariant() ?? "";
        return path == "/api/sale-requests" ||
               path == "/api/listings" ||
               path == "/api/payments/paid-listing/checkout" ||
               path == "/api/payments/paid-listing/create-request" ||
               path.Contains("/api/listings/") && path.EndsWith("/buy") ||
               path.Contains("/api/listing-price-offers/") && path.EndsWith("/purchase") ||
               path.Contains("/api/offers/") && path.EndsWith("/accept") ||
               path.Contains("/api/deals/") && (path.EndsWith("/confirm") || path.EndsWith("/cancel") || path.EndsWith("/dispute") || path.EndsWith("/delivered")) ||
               path.Contains("/api/admin/wallet");
    }

    private sealed class PostgresAdvisoryLease(AppDbContext db, string scope) : IAsyncDisposable
    {
        public static async Task<PostgresAdvisoryLease> AcquireAsync(AppDbContext db, string scope, CancellationToken cancellationToken)
        {
            await db.Database.OpenConnectionAsync(cancellationToken);
            try
            {
                await using var command = db.Database.GetDbConnection().CreateCommand();
                command.CommandText = "SELECT pg_advisory_lock(hashtext(@scope));";
                var parameter = command.CreateParameter();
                parameter.ParameterName = "scope";
                parameter.Value = scope;
                command.Parameters.Add(parameter);
                await command.ExecuteScalarAsync(cancellationToken);
                return new PostgresAdvisoryLease(db, scope);
            }
            catch
            {
                await db.Database.CloseConnectionAsync();
                throw;
            }
        }

        public async ValueTask DisposeAsync()
        {
            try
            {
                await using var command = db.Database.GetDbConnection().CreateCommand();
                command.CommandText = "SELECT pg_advisory_unlock(hashtext(@scope));";
                var parameter = command.CreateParameter();
                parameter.ParameterName = "scope";
                parameter.Value = scope;
                command.Parameters.Add(parameter);
                await command.ExecuteScalarAsync();
            }
            finally
            {
                await db.Database.CloseConnectionAsync();
            }
        }
    }
}
