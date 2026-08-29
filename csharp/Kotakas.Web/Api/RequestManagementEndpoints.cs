using System.Security.Claims;
using Kotakas.Web.Data;
using Kotakas.Web.Models;
using Microsoft.EntityFrameworkCore;

namespace Kotakas.Web.Api;

public static class RequestManagementEndpoints
{
    public static IEndpointRouteBuilder MapRequestManagementEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPatch("/api/sale-requests/{id:long}", async (long id, ClaimsPrincipal principal, SaleRequestManageInput input, AppDbContext db) =>
        {
            var row = await db.SaleRequests.Include(x => x.Offers).FirstOrDefaultAsync(x => x.Id == id);
            if (row is null) return Results.NotFound();
            if (row.UserId != ApiHelpers.UserId(principal) && !ApiHelpers.IsAnyAdmin(principal)) return Results.Forbid();
            if (row.Status != "open") return Results.Conflict(new { error = "request_not_open" });

            var nextItem = string.IsNullOrWhiteSpace(input.ItemName) ? row.ItemName : input.ItemName.Trim();
            var nextServer = string.IsNullOrWhiteSpace(input.ServerCode) ? row.ServerCode : input.ServerCode.Trim().ToUpperInvariant();
            var nextQuantity = input.Quantity ?? row.Quantity;
            var nextMinimum = input.MinimumGb ?? row.MinimumGb;
            var nextNote = input.Note is null ? row.Note : input.Note.Trim();
            if (nextItem.Length < 2 || nextItem.Length > 120 || nextQuantity < 1 || nextQuantity > 999 || nextMinimum <= 0 || nextMinimum > 100000 || nextNote.Length > 500 || ApiHelpers.HasExternalContact(nextItem + " " + nextNote))
                return Results.BadRequest(new { error = "invalid_or_external_contact" });

            var materialChange = nextItem != row.ItemName || nextServer != row.ServerCode || nextQuantity != row.Quantity || nextMinimum != row.MinimumGb;
            row.ItemName = nextItem;
            row.ServerCode = nextServer;
            row.Quantity = nextQuantity;
            row.MinimumGb = nextMinimum;
            row.Note = nextNote;

            if (materialChange)
            {
                var activeOffers = row.Offers.Where(x => x.Status == "active").ToList();
                foreach (var offer in activeOffers)
                {
                    offer.Status = "declined";
                    db.Notifications.Add(new AppNotification
                    {
                        UserId = offer.TraderUserId,
                        Title = "Satış talebi güncellendi",
                        Body = $"{row.ItemName} talebi değiştirildi. Eski teklifin kapatıldı; istersen yeniden teklif verebilirsin."
                    });
                }
            }

            await db.SaveChangesAsync();
            return Results.Ok(new { ok = true, request = ApiHelpers.RequestDto(row), offersReset = materialChange });
        }).RequireAuthorization();

        app.MapDelete("/api/sale-requests/{id:long}", async (long id, ClaimsPrincipal principal, IWebHostEnvironment env, AppDbContext db) =>
        {
            var row = await db.SaleRequests.Include(x => x.Offers).FirstOrDefaultAsync(x => x.Id == id);
            if (row is null) return Results.NotFound();
            if (row.UserId != ApiHelpers.UserId(principal) && !ApiHelpers.IsAnyAdmin(principal)) return Results.Forbid();
            if (row.Status != "open") return Results.Conflict(new { error = "request_not_open" });

            row.Status = "cancelled";
            foreach (var offer in row.Offers.Where(x => x.Status == "active"))
            {
                offer.Status = "declined";
                db.Notifications.Add(new AppNotification { UserId = offer.TraderUserId, Title = "Satış talebi iptal edildi", Body = $"{row.ItemName} talebi satıcı tarafından iptal edildi." });
            }
            await db.SaveChangesAsync();
            UploadEndpoints.DeleteExistingImages(env, id);
            return Results.Ok(new { ok = true, status = row.Status, feeRefunded = false });
        }).RequireAuthorization();

        return app;
    }
}

public record SaleRequestManageInput(string? ItemName, string? ServerCode, int? Quantity, decimal? MinimumGb, string? Note);
