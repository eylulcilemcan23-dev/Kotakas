using System.Globalization;
using System.Security.Claims;
using Iyzipay;
using Iyzipay.Model;
using Iyzipay.Request;
using Kotakas.Web.Data;
using Kotakas.Web.Models;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace Kotakas.Web.Api;

public static class PaymentEndpoints
{
    public static IEndpointRouteBuilder MapPaymentEndpoints(this IEndpointRouteBuilder app)
    {
        var payments = app.MapGroup("/api/payments");

        payments.MapPost("/paid-listing/checkout", async (
            ClaimsPrincipal principal,
            PaidListingCheckoutInput input,
            HttpContext http,
            IConfiguration configuration,
            UserManager<ApplicationUser> users,
            AppDbContext db) =>
        {
            if (!(principal.Identity?.IsAuthenticated ?? false)) return Results.Unauthorized();
            if (!IyzicoConfigured(configuration)) return Results.Json(new { error = "payment_provider_not_configured" }, statusCode: 503);
            if (principal.IsInRole("trader") || ApiHelpers.IsFullAdmin(principal))
                return Results.BadRequest(new { error = "paid_listing_not_required_for_role" });

            var uid = ApiHelpers.UserId(principal);
            var start = new DateTimeOffset(DateTime.UtcNow.Year, DateTime.UtcNow.Month, 1, 0, 0, 0, TimeSpan.Zero);
            var used = await db.SaleRequests.CountAsync(x => x.UserId == uid && x.CreatedAt >= start);
            if (used < 1) return Results.Conflict(new { error = "free_listing_quota_available" });

            var existingCredit = await db.PaymentIntents.AsNoTracking()
                .AnyAsync(x => x.UserId == uid && x.Purpose == "paid_listing_credit" && x.Status == "paid" && x.ConsumedAt == null);
            if (existingCredit) return Results.Conflict(new { error = "paid_listing_credit_already_available" });

            var feeTry = await ApiHelpers.SettingDecimal(db, "paid_listing_try", 0m);
            if (feeTry <= 0) return Results.Json(new { error = "paid_listing_price_not_configured" }, statusCode: 503);
            if (!ValidCheckoutInput(input)) return Results.BadRequest(new { error = "invalid_billing_information" });

            var user = await users.GetUserAsync(principal);
            if (user is null || string.IsNullOrWhiteSpace(user.Email)) return Results.Unauthorized();

            var callbackBase = configuration["Payments:CallbackBaseUrl"]?.Trim().TrimEnd('/');
            if (!Uri.TryCreate(callbackBase, UriKind.Absolute, out var callbackUri) || callbackUri.Scheme is not ("http" or "https"))
                return Results.Json(new { error = "payment_callback_not_configured" }, statusCode: 503);

            var intent = new PaymentIntent
            {
                UserId = uid,
                AmountTry = Math.Round(feeTry, 2, MidpointRounding.AwayFromZero),
                Provider = "iyzico",
                ConversationId = $"KTL-{Guid.NewGuid():N}",
                Status = "creating"
            };
            db.PaymentIntents.Add(intent);
            await db.SaveChangesAsync();

            try
            {
                var amount = intent.AmountTry.ToString("0.00", CultureInfo.InvariantCulture);
                var contactName = $"{input.Name!.Trim()} {input.Surname!.Trim()}";
                var address = new Address
                {
                    ContactName = contactName,
                    City = input.City!.Trim(),
                    Country = "Turkey",
                    Description = input.Address!.Trim(),
                    ZipCode = input.ZipCode!.Trim()
                };
                var request = new CreateCheckoutFormInitializeRequest
                {
                    Locale = Locale.TR.ToString(),
                    ConversationId = intent.ConversationId,
                    Price = amount,
                    PaidPrice = amount,
                    Currency = Currency.TRY.ToString(),
                    BasketId = $"KOTAKAS-LISTING-{intent.Id}",
                    PaymentGroup = PaymentGroup.PRODUCT.ToString(),
                    CallbackUrl = $"{callbackBase}/api/payments/iyzico/callback",
                    Buyer = new Buyer
                    {
                        Id = uid,
                        Name = input.Name.Trim(),
                        Surname = input.Surname.Trim(),
                        GsmNumber = input.GsmNumber!.Trim(),
                        Email = user.Email,
                        IdentityNumber = input.IdentityNumber!.Trim(),
                        RegistrationAddress = input.Address.Trim(),
                        Ip = http.Connection.RemoteIpAddress?.ToString() ?? "127.0.0.1",
                        City = input.City.Trim(),
                        Country = "Turkey",
                        ZipCode = input.ZipCode.Trim()
                    },
                    ShippingAddress = address,
                    BillingAddress = address,
                    BasketItems = new List<BasketItem>
                    {
                        new()
                        {
                            Id = $"PLI-{intent.Id}",
                            Name = "KOTAKAS ücretli satış talebi hakkı",
                            Category1 = "KOTAKAS",
                            Category2 = "İlan Hizmeti",
                            ItemType = BasketItemType.VIRTUAL.ToString(),
                            Price = amount
                        }
                    }
                };

                var checkout = await CheckoutFormInitialize.Create(request, BuildOptions(configuration));
                if (!string.Equals(checkout.Status, "success", StringComparison.OrdinalIgnoreCase) ||
                    string.IsNullOrWhiteSpace(checkout.Token) || string.IsNullOrWhiteSpace(checkout.PaymentPageUrl))
                {
                    intent.Status = "failed";
                    intent.ErrorMessage = TrimError(checkout.ErrorMessage);
                    await db.SaveChangesAsync();
                    return Results.Json(new { error = "payment_checkout_initialize_failed" }, statusCode: 502);
                }

                intent.ProviderToken = checkout.Token;
                intent.Status = "pending";
                await db.SaveChangesAsync();
                return Results.Ok(new { ok = true, paymentPageUrl = checkout.PaymentPageUrl, intentId = intent.Id });
            }
            catch (Exception ex)
            {
                intent.Status = "failed";
                intent.ErrorMessage = TrimError(ex.Message);
                await db.SaveChangesAsync();
                return Results.Json(new { error = "payment_checkout_initialize_failed" }, statusCode: 502);
            }
        }).RequireAuthorization();

        payments.MapGet("/paid-listing/status", async (ClaimsPrincipal principal, AppDbContext db) =>
        {
            var uid = ApiHelpers.UserId(principal);
            var latest = await db.PaymentIntents.AsNoTracking()
                .Where(x => x.UserId == uid && x.Purpose == "paid_listing_credit")
                .OrderByDescending(x => x.Id)
                .Select(x => new { x.Id, x.AmountTry, x.Status, x.CreatedAt, x.PaidAt, x.ConsumedAt })
                .FirstOrDefaultAsync();
            var availableCredit = await db.PaymentIntents.AsNoTracking()
                .AnyAsync(x => x.UserId == uid && x.Purpose == "paid_listing_credit" && x.Status == "paid" && x.ConsumedAt == null);
            return Results.Ok(new { latest, availableCredit });
        }).RequireAuthorization();

        payments.MapPost("/paid-listing/create-request", async (ClaimsPrincipal principal, SaleRequestInput input, AppDbContext db) =>
        {
            if (principal.IsInRole("trader") || ApiHelpers.IsFullAdmin(principal))
                return Results.BadRequest(new { error = "paid_listing_not_required_for_role" });

            var uid = ApiHelpers.UserId(principal);
            var item = (input.ItemName ?? "").Trim();
            var note = (input.Note ?? "").Trim();
            if (item.Length < 2 || input.MinimumGb <= 0 || input.Quantity < 1 || ApiHelpers.HasExternalContact(item + " " + note))
                return Results.BadRequest(new { error = "invalid_or_external_contact" });

            var start = new DateTimeOffset(DateTime.UtcNow.Year, DateTime.UtcNow.Month, 1, 0, 0, 0, TimeSpan.Zero);
            var used = await db.SaleRequests.CountAsync(x => x.UserId == uid && x.CreatedAt >= start);
            if (used < 1) return Results.Conflict(new { error = "free_listing_quota_available" });

            await using var tx = await db.Database.BeginTransactionAsync();
            var credit = await db.PaymentIntents
                .Where(x => x.UserId == uid && x.Purpose == "paid_listing_credit" && x.Status == "paid" && x.ConsumedAt == null)
                .OrderBy(x => x.Id)
                .FirstOrDefaultAsync();
            if (credit is null) return Results.Json(new { error = "paid_listing_credit_required" }, statusCode: 402);

            var consumedAt = DateTimeOffset.UtcNow;
            var claimed = await db.Database.ExecuteSqlInterpolatedAsync($@"
                UPDATE PaymentIntents
                SET Status = {'consumed'}, ConsumedAt = {consumedAt}
                WHERE Id = {credit.Id} AND Status = {'paid'} AND ConsumedAt IS NULL");
            if (claimed != 1) return Results.Conflict(new { error = "paid_listing_credit_already_consumed" });

            var row = new SaleRequest
            {
                UserId = uid,
                ItemName = item,
                ServerCode = (input.ServerCode ?? "ZERO").Trim().ToUpperInvariant(),
                Quantity = input.Quantity,
                MinimumGb = input.MinimumGb,
                Note = note
            };
            db.SaleRequests.Add(row);
            await db.SaveChangesAsync();
            var traders = await db.Users.AsNoTracking().Where(x => x.VerifiedTrader && x.AccountStatus == "active").Select(x => x.Id).ToListAsync();
            db.Notifications.AddRange(traders.Select(id => new AppNotification
            {
                UserId = id,
                Title = "Yeni satış talebi",
                Body = $"{row.ServerCode} • {row.ItemName} • minimum {row.MinimumGb:0.##} GB"
            }));
            db.Notifications.Add(new AppNotification
            {
                UserId = uid,
                Title = "Ücretli ilan hakkı kullanıldı",
                Body = $"{row.ItemName} satış talebi iyzico ile doğrulanmış ilan hakkın kullanılarak yayınlandı."
            });
            await db.SaveChangesAsync();
            await tx.CommitAsync();
            return Results.Json(new { ok = true, request = row, feeTry = credit.AmountTry, paymentMethod = "iyzico_credit" }, statusCode: 201);
        }).RequireAuthorization();

        app.MapPost("/api/payments/iyzico/callback", async (HttpRequest request, IConfiguration configuration, AppDbContext db) =>
        {
            if (!IyzicoConfigured(configuration)) return Results.Redirect("/sell.html?payment=provider_disabled");
            if (!request.HasFormContentType) return Results.Redirect("/sell.html?payment=failed");
            var form = await request.ReadFormAsync();
            var token = form["token"].ToString().Trim();
            if (string.IsNullOrWhiteSpace(token)) return Results.Redirect("/sell.html?payment=failed");

            var intent = await db.PaymentIntents.FirstOrDefaultAsync(x => x.Provider == "iyzico" && x.ProviderToken == token);
            if (intent is null) return Results.Redirect("/sell.html?payment=failed");
            if (intent.Status is "paid" or "consumed") return Results.Redirect("/sell.html?payment=paid");

            try
            {
                var result = await CheckoutForm.Retrieve(new RetrieveCheckoutFormRequest
                {
                    ConversationId = intent.ConversationId,
                    Token = token
                }, BuildOptions(configuration));

                var paidAmount = ParseMoney(result.PaidPrice);
                var valid = string.Equals(result.Status, "success", StringComparison.OrdinalIgnoreCase) &&
                            string.Equals(result.PaymentStatus, "SUCCESS", StringComparison.OrdinalIgnoreCase) &&
                            string.Equals(result.ConversationId, intent.ConversationId, StringComparison.Ordinal) &&
                            string.Equals(result.Currency, Currency.TRY.ToString(), StringComparison.OrdinalIgnoreCase) &&
                            paidAmount == intent.AmountTry;

                if (!valid)
                {
                    intent.Status = "failed";
                    intent.ErrorMessage = TrimError(result.ErrorMessage ?? "iyzico_verification_failed");
                    await db.SaveChangesAsync();
                    return Results.Redirect("/sell.html?payment=failed");
                }

                intent.Status = "paid";
                intent.ProviderPaymentId = result.PaymentId;
                intent.PaidAt = DateTimeOffset.UtcNow;
                intent.ErrorMessage = null;
                db.Notifications.Add(new AppNotification
                {
                    UserId = intent.UserId,
                    Title = "Ücretli ilan hakkı hazır",
                    Body = $"{intent.AmountTry:0.00} ₺ ödeme doğrulandı. Bir ücretli satış talebi yayınlayabilirsin."
                });
                await db.SaveChangesAsync();
                return Results.Redirect("/sell.html?payment=paid");
            }
            catch (Exception ex)
            {
                intent.ErrorMessage = TrimError(ex.Message);
                await db.SaveChangesAsync();
                return Results.Redirect("/sell.html?payment=failed");
            }
        });

        return app;
    }

    private static bool IyzicoConfigured(IConfiguration configuration) =>
        string.Equals(configuration["Payments:Provider"], "iyzico", StringComparison.OrdinalIgnoreCase) &&
        !string.IsNullOrWhiteSpace(configuration["Payments:BaseUrl"]) &&
        !string.IsNullOrWhiteSpace(configuration["Payments:ApiKey"]) &&
        !string.IsNullOrWhiteSpace(configuration["Payments:SecretKey"]) &&
        !string.IsNullOrWhiteSpace(configuration["Payments:CallbackBaseUrl"]);

    private static Options BuildOptions(IConfiguration configuration) => new()
    {
        ApiKey = configuration["Payments:ApiKey"]!.Trim(),
        SecretKey = configuration["Payments:SecretKey"]!.Trim(),
        BaseUrl = configuration["Payments:BaseUrl"]!.Trim().TrimEnd('/')
    };

    private static bool ValidCheckoutInput(PaidListingCheckoutInput input) =>
        !string.IsNullOrWhiteSpace(input.Name) && input.Name.Trim().Length >= 2 &&
        !string.IsNullOrWhiteSpace(input.Surname) && input.Surname.Trim().Length >= 2 &&
        !string.IsNullOrWhiteSpace(input.GsmNumber) && input.GsmNumber.Trim().Length >= 10 &&
        !string.IsNullOrWhiteSpace(input.IdentityNumber) && input.IdentityNumber.Trim().Length >= 5 &&
        !string.IsNullOrWhiteSpace(input.Address) && input.Address.Trim().Length >= 8 &&
        !string.IsNullOrWhiteSpace(input.City) && input.City.Trim().Length >= 2 &&
        !string.IsNullOrWhiteSpace(input.ZipCode);

    private static decimal ParseMoney(string? value) =>
        decimal.TryParse(value, NumberStyles.Number, CultureInfo.InvariantCulture, out var result) ? Math.Round(result, 2) : -1m;

    private static string TrimError(string? value)
    {
        var text = string.IsNullOrWhiteSpace(value) ? "unknown_error" : value.Trim();
        return text.Length <= 500 ? text : text[..500];
    }
}

public record PaidListingCheckoutInput(
    string? Name,
    string? Surname,
    string? GsmNumber,
    string? IdentityNumber,
    string? Address,
    string? City,
    string? ZipCode);
