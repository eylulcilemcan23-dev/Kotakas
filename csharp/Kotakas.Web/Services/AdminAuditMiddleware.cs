using Kotakas.Web.Api;
using Kotakas.Web.Data;
using Kotakas.Web.Models;

namespace Kotakas.Web.Services;

public sealed class AdminAuditMiddleware(RequestDelegate next, IServiceScopeFactory scopes, ILogger<AdminAuditMiddleware> logger)
{
    public async Task InvokeAsync(HttpContext context)
    {
        var shouldAudit = context.User.Identity?.IsAuthenticated == true
            && ApiHelpers.IsAnyAdmin(context.User)
            && context.Request.Path.StartsWithSegments("/api/admin")
            && !HttpMethods.IsGet(context.Request.Method)
            && !HttpMethods.IsHead(context.Request.Method)
            && !HttpMethods.IsOptions(context.Request.Method);

        var status = StatusCodes.Status200OK;
        try
        {
            await next(context);
            status = context.Response.StatusCode;
        }
        catch
        {
            status = StatusCodes.Status500InternalServerError;
            if (shouldAudit) await WriteAudit(context, status);
            throw;
        }

        if (shouldAudit) await WriteAudit(context, status);
    }

    private async Task WriteAudit(HttpContext context, int status)
    {
        try
        {
            using var scope = scopes.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.AdminAuditEvents.Add(new AdminAuditEvent
            {
                AdminUserId = ApiHelpers.UserId(context.User),
                Method = context.Request.Method.ToUpperInvariant(),
                Path = (context.Request.Path.Value ?? "/").Length > 240 ? (context.Request.Path.Value ?? "/")[..240] : context.Request.Path.Value ?? "/",
                StatusCode = status
            });
            await db.SaveChangesAsync();
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Could not persist admin audit event.");
        }
    }
}
