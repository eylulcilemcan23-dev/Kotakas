using System.Security.Claims;
using Kotakas.Web.Data;
using Kotakas.Web.Models;
using Microsoft.EntityFrameworkCore;

namespace Kotakas.Web.Api;

public static class SupportEndpoints
{
    public static IEndpointRouteBuilder MapSupportEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/notifications", async (ClaimsPrincipal p, AppDbContext db) => Results.Ok(new { notifications = await db.Notifications.AsNoTracking().Where(x => x.UserId == ApiHelpers.UserId(p)).OrderByDescending(x => x.Id).Take(100).ToListAsync() })).RequireAuthorization();
        app.MapPost("/api/notifications/read-all", async (ClaimsPrincipal p, AppDbContext db) => { foreach (var n in await db.Notifications.Where(x => x.UserId == ApiHelpers.UserId(p) && !x.IsRead).ToListAsync()) n.IsRead = true; await db.SaveChangesAsync(); return Results.Ok(new { ok = true }); }).RequireAuthorization();
        app.MapPost("/api/trader-applications", async (ClaimsPrincipal p, TraderApplicationInput input, AppDbContext db) =>
        {
            var uid = ApiHelpers.UserId(p); if (await db.TraderApplications.AnyAsync(x => x.UserId == uid && x.Status == "pending")) return Results.Conflict(new { error = "application_already_pending" });
            var row = new TraderApplication { UserId = uid, StoreName = (input.StoreName ?? "").Trim(), ServerCode = (input.ServerCode ?? "ZERO").Trim().ToUpperInvariant(), Experience = (input.Experience ?? "").Trim() };
            if (row.StoreName.Length < 2 || row.Experience.Length < 3 || ApiHelpers.HasExternalContact(row.StoreName + " " + row.Experience)) return Results.BadRequest(new { error = "invalid_application" });
            db.TraderApplications.Add(row); await db.SaveChangesAsync(); return Results.Json(new { ok = true, application = row }, statusCode: 201);
        }).RequireAuthorization();
        app.MapPost("/api/support", async (ClaimsPrincipal p, SupportInput input, AppDbContext db) =>
        {
            var subject = (input.Subject ?? "").Trim(); var message = (input.Message ?? "").Trim(); if (subject.Length < 3 || message.Length < 5) return Results.BadRequest(new { error = "invalid_ticket" });
            var row = new SupportTicket { UserId = ApiHelpers.UserId(p), Subject = subject, Message = message, Priority = input.Priority is "low" or "high" ? input.Priority : "normal" };
            db.SupportTickets.Add(row); await db.SaveChangesAsync(); return Results.Json(new { ok = true, ticket = row }, statusCode: 201);
        }).RequireAuthorization();
        return app;
    }
}
public record TraderApplicationInput(string? StoreName, string? ServerCode, string? Experience);
public record SupportInput(string? Subject, string? Message, string? Priority = "normal");
