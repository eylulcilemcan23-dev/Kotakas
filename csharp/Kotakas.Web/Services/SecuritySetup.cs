using System.Security.Claims;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;

namespace Kotakas.Web.Services;

public static class SecuritySetup
{
    public static IServiceCollection AddKotakasSecurity(this IServiceCollection services)
    {
        services.AddRateLimiter(options =>
        {
            options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(context =>
            {
                var path = context.Request.Path.Value?.ToLowerInvariant() ?? "";
                var unsafeMethod = !HttpMethods.IsGet(context.Request.Method) &&
                                   !HttpMethods.IsHead(context.Request.Method) &&
                                   !HttpMethods.IsOptions(context.Request.Method);
                var authSensitive = path is "/api/login" or "/api/register" ||
                                    path.StartsWith("/api/auth/forgot-password") ||
                                    path.StartsWith("/api/auth/resend-confirmation");

                var identity = context.User.Identity?.IsAuthenticated == true
                    ? context.User.FindFirstValue(ClaimTypes.NameIdentifier) ?? "auth-unknown"
                    : context.Connection.RemoteIpAddress?.ToString() ?? "ip-unknown";

                var permit = authSensitive ? 8 : unsafeMethod ? 80 : 360;
                var bucket = authSensitive ? "auth" : unsafeMethod ? "write" : "read";
                return RateLimitPartition.GetFixedWindowLimiter($"{bucket}:{identity}", _ => new FixedWindowRateLimiterOptions
                {
                    PermitLimit = permit,
                    Window = TimeSpan.FromMinutes(1),
                    QueueLimit = 0,
                    AutoReplenishment = true
                });
            });
            options.OnRejected = async (context, token) =>
            {
                context.HttpContext.Response.ContentType = "application/json; charset=utf-8";
                await context.HttpContext.Response.WriteAsJsonAsync(new { error = "rate_limit_exceeded" }, token);
            };
        });
        return services;
    }
}
