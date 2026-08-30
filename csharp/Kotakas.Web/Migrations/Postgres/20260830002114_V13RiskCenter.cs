using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Kotakas.Web.Migrations.Postgres
{
    /// <inheritdoc />
    public partial class V13RiskCenter : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "RiskSignals",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Fingerprint = table.Column<string>(type: "text", nullable: false),
                    Code = table.Column<string>(type: "text", nullable: false),
                    Severity = table.Column<string>(type: "text", nullable: false),
                    Status = table.Column<string>(type: "text", nullable: false),
                    SubjectUserId = table.Column<string>(type: "text", nullable: true),
                    DealId = table.Column<long>(type: "bigint", nullable: true),
                    WalletLedgerId = table.Column<long>(type: "bigint", nullable: true),
                    AmountTry = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: true),
                    Title = table.Column<string>(type: "text", nullable: false),
                    Details = table.Column<string>(type: "text", nullable: false),
                    FirstDetectedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    LastDetectedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    ReviewedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    ReviewedByUserId = table.Column<string>(type: "text", nullable: true),
                    ResolutionNote = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RiskSignals", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_WalletLedgers_AdminUserId_CreatedAt",
                table: "WalletLedgers",
                columns: new[] { "AdminUserId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_WalletLedgers_Type_CreatedAt",
                table: "WalletLedgers",
                columns: new[] { "Type", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_SaleRequests_UserId_Status_CreatedAt",
                table: "SaleRequests",
                columns: new[] { "UserId", "Status", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_PaymentIntents_Status_CreatedAt",
                table: "PaymentIntents",
                columns: new[] { "Status", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_Listings_SellerUserId_Status_CreatedAt",
                table: "Listings",
                columns: new[] { "SellerUserId", "Status", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_Deals_Status_CreatedAt",
                table: "Deals",
                columns: new[] { "Status", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_Deals_TraderUserId_Status_CreatedAt",
                table: "Deals",
                columns: new[] { "TraderUserId", "Status", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_Deals_UserId_Status_CreatedAt",
                table: "Deals",
                columns: new[] { "UserId", "Status", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_RiskSignals_Code_Status_LastDetectedAt",
                table: "RiskSignals",
                columns: new[] { "Code", "Status", "LastDetectedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_RiskSignals_Fingerprint",
                table: "RiskSignals",
                column: "Fingerprint",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_RiskSignals_Status_Severity_LastDetectedAt",
                table: "RiskSignals",
                columns: new[] { "Status", "Severity", "LastDetectedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_RiskSignals_SubjectUserId_LastDetectedAt",
                table: "RiskSignals",
                columns: new[] { "SubjectUserId", "LastDetectedAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "RiskSignals");

            migrationBuilder.DropIndex(
                name: "IX_WalletLedgers_AdminUserId_CreatedAt",
                table: "WalletLedgers");

            migrationBuilder.DropIndex(
                name: "IX_WalletLedgers_Type_CreatedAt",
                table: "WalletLedgers");

            migrationBuilder.DropIndex(
                name: "IX_SaleRequests_UserId_Status_CreatedAt",
                table: "SaleRequests");

            migrationBuilder.DropIndex(
                name: "IX_PaymentIntents_Status_CreatedAt",
                table: "PaymentIntents");

            migrationBuilder.DropIndex(
                name: "IX_Listings_SellerUserId_Status_CreatedAt",
                table: "Listings");

            migrationBuilder.DropIndex(
                name: "IX_Deals_Status_CreatedAt",
                table: "Deals");

            migrationBuilder.DropIndex(
                name: "IX_Deals_TraderUserId_Status_CreatedAt",
                table: "Deals");

            migrationBuilder.DropIndex(
                name: "IX_Deals_UserId_Status_CreatedAt",
                table: "Deals");
        }
    }
}
