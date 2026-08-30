using System.Security.Claims;
using Kotakas.Web.Data;
using Kotakas.Web.Models;
using Kotakas.Web.Services;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace Kotakas.Web.Api;

public static class AccountEndpoints
{
    public static IEndpointRouteBuilder MapAccountEndpoints(this IEndpointRouteBuilder app)
    {
        var account = app.MapGroup("/api/account").RequireAuthorization();

        account.MapPatch("/profile", async (ClaimsPrincipal principal, ProfileUpdateInput input, UserManager<ApplicationUser> users) =>
        {
            var user = await users.GetUserAsync(principal);
            if (user is null) return Results.Unauthorized();
            var name = (input.DisplayName ?? "").Trim();
            if (name.Length < 2 || name.Length > 40 || ApiHelpers.HasExternalContact(name))
                return Results.BadRequest(new { error = "invalid_display_name" });
            user.DisplayName = name;
            var result = await users.UpdateAsync(user);
            return result.Succeeded
                ? Results.Ok(new { ok = true, user = await ApiHelpers.UserDto(users, user) })
                : Results.BadRequest(new { error = "profile_update_failed", details = result.Errors.Select(x => x.Description) });
        });

        account.MapPost("/password", async (ClaimsPrincipal principal, PasswordChangeInput input, HttpContext http, UserManager<ApplicationUser> users, SignInManager<ApplicationUser> signIn, AppDbContext db) =>
        {
            var user = await users.GetUserAsync(principal);
            if (user is null) return Results.Unauthorized();
            var next = input.NewPassword ?? "";
            if (next.Length < 10 || next.Length > 128 || !next.Any(char.IsDigit))
                return Results.BadRequest(new { error = "invalid_new_password" });

            IdentityResult result;
            if (await users.HasPasswordAsync(user))
            {
                if (string.IsNullOrWhiteSpace(input.CurrentPassword)) return Results.BadRequest(new { error = "current_password_required" });
                result = await users.ChangePasswordAsync(user, input.CurrentPassword, next);
            }
            else
            {
                result = await users.AddPasswordAsync(user, next);
            }

            if (!result.Succeeded)
                return Results.BadRequest(new { error = "password_change_failed", details = result.Errors.Select(x => x.Description) });

            var currentDevice = http.Items["KOTAKAS_DEVICE_ID"]?.ToString() ?? http.Request.Cookies[SessionSecurityMiddleware.DeviceCookie] ?? "";
            var now = DateTimeOffset.UtcNow;
            var otherSessions = await db.UserSessions
                .Where(x => x.UserId == user.Id && x.RevokedAt == null && x.DeviceId != currentDevice)
                .ToListAsync();
            foreach (var session in otherSessions) session.RevokedAt = now;
            await db.SaveChangesAsync();

            await signIn.RefreshSignInAsync(user);
            return Results.Ok(new { ok = true, otherSessionsRevoked = otherSessions.Count });
        });

        account.MapPost("/test-wallet-topup", async (
            ClaimsPrincipal principal,
            TestWalletTopupInput input,
            HttpContext http,
            IWebHostEnvironment environment,
            AppDbContext db) =>
        {
            var host = http.Request.Host.Host.Trim().ToLowerInvariant();
            var localHost = host is "127.0.0.1" or "localhost" or "::1";
            if (!environment.IsDevelopment() || !localHost)
                return Results.NotFound(new { error = "local_preview_only" });

            var amount = Math.Round(input.AmountTry, 2, MidpointRounding.AwayFromZero);
            if (amount < 10m || amount > 5000m)
                return Results.BadRequest(new { error = "invalid_test_topup_amount", minTry = 10m, maxTry = 5000m });

            var uid = ApiHelpers.UserId(principal);
            var wallet = await ApiHelpers.WalletFor(db, uid);
            var before = wallet.BalanceTry;
            wallet.BalanceTry += amount;
            wallet.UpdatedAt = DateTimeOffset.UtcNow;
            db.WalletLedgers.Add(new WalletLedger
            {
                UserId = uid,
                AmountTry = amount,
                BeforeTry = before,
                AfterTry = wallet.BalanceTry,
                Type = "local_test_topup",
                Reason = "Yerel önizleme sanal bakiye yüklemesi"
            });
            await db.SaveChangesAsync();

            return Results.Ok(new
            {
                ok = true,
                testMode = true,
                addedTry = amount,
                balanceTry = wallet.BalanceTry
            });
        });

        account.MapPost("/test-wallet-withdraw", async (
            ClaimsPrincipal principal,
            TestWalletWithdrawalInput input,
            HttpContext http,
            IWebHostEnvironment environment,
            AppDbContext db) =>
        {
            var host = http.Request.Host.Host.Trim().ToLowerInvariant();
            var localHost = host is "127.0.0.1" or "localhost" or "::1";
            if (!environment.IsDevelopment() || !localHost)
                return Results.NotFound(new { error = "local_preview_only" });

            var amount = Math.Round(input.AmountTry, 2, MidpointRounding.AwayFromZero);
            if (amount < 10m || amount > 5000m)
                return Results.BadRequest(new { error = "invalid_test_withdraw_amount", minTry = 10m, maxTry = 5000m });

            var uid = ApiHelpers.UserId(principal);
            var wallet = await ApiHelpers.WalletFor(db, uid);
            if (wallet.BalanceTry < amount)
                return Results.Json(new { error = "wallet_balance_insufficient", requiredTry = amount, balanceTry = wallet.BalanceTry }, statusCode: 402);

            var before = wallet.BalanceTry;
            wallet.BalanceTry -= amount;
            wallet.UpdatedAt = DateTimeOffset.UtcNow;
            db.WalletLedgers.Add(new WalletLedger
            {
                UserId = uid,
                AmountTry = -amount,
                BeforeTry = before,
                AfterTry = wallet.BalanceTry,
                Type = "local_test_withdrawal",
                Reason = "Yerel önizleme sanal bakiye çekim testi"
            });
            await db.SaveChangesAsync();

            return Results.Ok(new
            {
                ok = true,
                testMode = true,
                withdrawnTry = amount,
                balanceTry = wallet.BalanceTry
            });
        });

        return app;
    }
}

public record ProfileUpdateInput(string? DisplayName);
public record PasswordChangeInput(string? CurrentPassword, string? NewPassword);
public record TestWalletTopupInput(decimal AmountTry);
public record TestWalletWithdrawalInput(decimal AmountTry);
