/*
 * AnnaSetu — Hyperledger Fabric Chaincode
 * Smart contract for food donation lifecycle management
 * Go 1.21 + Fabric Contract API v2
 */

package main

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

// ── Data Structures ───────────────────────────────────────────────────────────

type DonationStatus string

const (
	StatusPending    DonationStatus = "PENDING"
	StatusVerified   DonationStatus = "VERIFIED"
	StatusMatched    DonationStatus = "MATCHED"
	StatusDispatched DonationStatus = "DISPATCHED"
	StatusDelivered  DonationStatus = "DELIVERED"
	StatusExpired    DonationStatus = "EXPIRED"
	StatusCancelled  DonationStatus = "CANCELLED"
)

type DonationLot struct {
	ID              string         `json:"id"`
	LotNumber       string         `json:"lotNumber"`
	DonorID         string         `json:"donorId"`
	DonorName       string         `json:"donorName"`
	DonorPAN        string         `json:"donorPan"`
	Category        string         `json:"category"`
	Description     string         `json:"description"`
	QuantityKg      float64        `json:"quantityKg"`
	EstimatedValue  float64        `json:"estimatedValue"`  // INR
	ExpiryDate      string         `json:"expiryDate"`
	StorageReqTemp  string         `json:"storageReqTemp"`
	IsVegetarian    bool           `json:"isVegetarian"`
	FSSAILicense    string         `json:"fssaiLicense"`
	PickupLocation  GeoPoint       `json:"pickupLocation"`
	Status          DonationStatus `json:"status"`
	AssignedNGO     string         `json:"assignedNgo,omitempty"`
	NGOName         string         `json:"ngoName,omitempty"`
	ErupiVoucherID  string         `json:"erupiVoucherId,omitempty"`
	CertificateNo   string         `json:"certificateNo,omitempty"`
	QRCode          string         `json:"qrCode,omitempty"`
	CreatedAt       string         `json:"createdAt"`
	UpdatedAt       string         `json:"updatedAt"`
	StatusHistory   []StatusChange `json:"statusHistory"`
	DocType         string         `json:"docType"`  // for CouchDB queries
}

type GeoPoint struct {
	Lat float64 `json:"lat"`
	Lng float64 `json:"lng"`
}

type StatusChange struct {
	From      DonationStatus `json:"from"`
	To        DonationStatus `json:"to"`
	Actor     string         `json:"actor"`
	Org       string         `json:"org"`
	Reason    string         `json:"reason,omitempty"`
	Timestamp string         `json:"timestamp"`
	TxID      string         `json:"txId"`
}

type NGOReceipt struct {
	ID           string  `json:"id"`
	LotID        string  `json:"lotId"`
	NGOID        string  `json:"ngoId"`
	NGOName      string  `json:"ngoName"`
	ReceivedKg   float64 `json:"receivedKg"`
	BeneficiaryCount int `json:"beneficiaryCount"`
	ReceivedAt   string  `json:"receivedAt"`
	VerifierSign string  `json:"verifierSign"`
	DocType      string  `json:"docType"`
}

type DonorStats struct {
	DonorID        string  `json:"donorId"`
	TotalLots      int     `json:"totalLots"`
	TotalKg        float64 `json:"totalKg"`
	TotalValue     float64 `json:"totalValue"`
	DeliveredLots  int     `json:"deliveredLots"`
	ExpiredLots    int     `json:"expiredLots"`
	LastUpdated    string  `json:"lastUpdated"`
}

// ── Smart Contract ────────────────────────────────────────────────────────────

type AnnasetuContract struct {
	contractapi.Contract
}

// InitLedger — seed initial state (for testing)
func (c *AnnasetuContract) InitLedger(ctx contractapi.TransactionContextInterface) error {
	fmt.Println("[AnnaSetu] InitLedger called")
	return nil
}

// RegisterDonationLot — DonorOrg creates a new donation lot
func (c *AnnasetuContract) RegisterDonationLot(
	ctx contractapi.TransactionContextInterface,
	id, lotNumber, donorID, donorName, donorPAN, category, description string,
	quantityKg, estimatedValue float64,
	expiryDate, fssaiLicense string,
	pickupLat, pickupLng float64,
	isVegetarian bool,
) error {
	// Authorization: only DonorOrg peers can create lots
	mspID, err := ctx.GetClientIdentity().GetMSPID()
	if err != nil {
		return fmt.Errorf("failed to get MSP ID: %v", err)
	}
	if mspID != "DonorOrgMSP" {
		return fmt.Errorf("only DonorOrg can register donation lots, got: %s", mspID)
	}

	// Check duplicate
	existing, err := ctx.GetStub().GetState(id)
	if err != nil {
		return fmt.Errorf("failed to read state: %v", err)
	}
	if existing != nil {
		return fmt.Errorf("lot %s already exists", id)
	}

	now  := time.Now().UTC().Format(time.RFC3339)
	txID := ctx.GetStub().GetTxID()

	lot := DonationLot{
		ID:             id,
		LotNumber:      lotNumber,
		DonorID:        donorID,
		DonorName:      donorName,
		DonorPAN:       donorPAN,
		Category:       category,
		Description:    description,
		QuantityKg:     quantityKg,
		EstimatedValue: estimatedValue,
		ExpiryDate:     expiryDate,
		FSSAILicense:   fssaiLicense,
		PickupLocation: GeoPoint{Lat: pickupLat, Lng: pickupLng},
		IsVegetarian:   isVegetarian,
		Status:         StatusPending,
		CreatedAt:      now,
		UpdatedAt:      now,
		DocType:        "DonationLot",
		StatusHistory: []StatusChange{
			{From: "", To: StatusPending, Actor: donorID, Org: mspID, Timestamp: now, TxID: txID},
		},
	}

	lotJSON, err := json.Marshal(lot)
	if err != nil {
		return err
	}
	if err := ctx.GetStub().PutState(id, lotJSON); err != nil {
		return err
	}

	// Emit event
	return ctx.GetStub().SetEvent("LotRegistered", lotJSON)
}

// VerifyLot — Any org verifies lot (typically NGOOrg or BankOrg)
func (c *AnnasetuContract) VerifyLot(
	ctx contractapi.TransactionContextInterface,
	lotID, verifierID, verifierOrg, notes string,
) error {
	lot, err := c.getLot(ctx, lotID)
	if err != nil {
		return err
	}
	if lot.Status != StatusPending {
		return fmt.Errorf("lot %s is in status %s, cannot verify", lotID, lot.Status)
	}

	return c.updateLotStatus(ctx, lot, StatusVerified, verifierID, verifierOrg, notes)
}

// AssignToNGO — NGOOrg claims a lot
func (c *AnnasetuContract) AssignToNGO(
	ctx contractapi.TransactionContextInterface,
	lotID, ngoID, ngoName string,
) error {
	mspID, _ := ctx.GetClientIdentity().GetMSPID()
	if mspID != "NGOOrgMSP" && mspID != "BankOrgMSP" {
		return fmt.Errorf("only NGOOrg or BankOrg can assign lots")
	}

	lot, err := c.getLot(ctx, lotID)
	if err != nil {
		return err
	}
	if lot.Status != StatusVerified {
		return fmt.Errorf("lot must be VERIFIED before assignment, current: %s", lot.Status)
	}

	lot.AssignedNGO = ngoID
	lot.NGOName     = ngoName
	return c.updateLotStatus(ctx, lot, StatusMatched, ngoID, mspID, "NGO assignment")
}

// LinkErupiVoucher — BankOrg links e-RUPI voucher to lot
func (c *AnnasetuContract) LinkErupiVoucher(
	ctx contractapi.TransactionContextInterface,
	lotID, voucherID string,
) error {
	mspID, _ := ctx.GetClientIdentity().GetMSPID()
	if mspID != "BankOrgMSP" {
		return fmt.Errorf("only BankOrg can link e-RUPI vouchers")
	}

	lot, err := c.getLot(ctx, lotID)
	if err != nil {
		return err
	}

	lot.ErupiVoucherID = voucherID
	lot.UpdatedAt      = time.Now().UTC().Format(time.RFC3339)
	lotJSON, _ := json.Marshal(lot)
	return ctx.GetStub().PutState(lotID, lotJSON)
}

// MarkDispatched — DonorOrg confirms handover to NGO/logistics
func (c *AnnasetuContract) MarkDispatched(
	ctx contractapi.TransactionContextInterface,
	lotID, actorID string,
) error {
	lot, err := c.getLot(ctx, lotID)
	if err != nil {
		return err
	}
	if lot.Status != StatusMatched {
		return fmt.Errorf("lot must be MATCHED before dispatch")
	}
	mspID, _ := ctx.GetClientIdentity().GetMSPID()
	return c.updateLotStatus(ctx, lot, StatusDispatched, actorID, mspID, "")
}

// ConfirmDelivery — NGOOrg confirms receipt and records beneficiary count
func (c *AnnasetuContract) ConfirmDelivery(
	ctx contractapi.TransactionContextInterface,
	lotID, ngoID string, receivedKg float64, beneficiaryCount int, verifierSign string,
) error {
	mspID, _ := ctx.GetClientIdentity().GetMSPID()
	if mspID != "NGOOrgMSP" {
		return fmt.Errorf("only NGOOrg can confirm delivery")
	}

	lot, err := c.getLot(ctx, lotID)
	if err != nil {
		return err
	}
	if lot.Status != StatusDispatched {
		return fmt.Errorf("lot must be DISPATCHED for delivery confirmation")
	}

	// Create receipt record
	now    := time.Now().UTC().Format(time.RFC3339)
	receipt := NGOReceipt{
		ID:               "RCPT-" + lotID,
		LotID:            lotID,
		NGOID:            ngoID,
		NGOName:          lot.NGOName,
		ReceivedKg:       receivedKg,
		BeneficiaryCount: beneficiaryCount,
		ReceivedAt:       now,
		VerifierSign:     verifierSign,
		DocType:          "NGOReceipt",
	}
	receiptJSON, _ := json.Marshal(receipt)
	if err := ctx.GetStub().PutState("RCPT-"+lotID, receiptJSON); err != nil {
		return err
	}

	err = c.updateLotStatus(ctx, lot, StatusDelivered, ngoID, mspID, fmt.Sprintf("%.1fkg received, %d beneficiaries", receivedKg, beneficiaryCount))
	if err != nil {
		return err
	}

	// Trigger 80G cert event
	certEvent, _ := json.Marshal(map[string]interface{}{
		"lotId":     lotID,
		"donorId":   lot.DonorID,
		"donorPan":  lot.DonorPAN,
		"value":     lot.EstimatedValue,
		"deliveredAt": now,
	})
	return ctx.GetStub().SetEvent("ReadyFor80GCert", certEvent)
}

// LinkCertificate — BankOrg records 80G certificate number
func (c *AnnasetuContract) LinkCertificate(
	ctx contractapi.TransactionContextInterface,
	lotID, certificateNo string,
) error {
	mspID, _ := ctx.GetClientIdentity().GetMSPID()
	if mspID != "BankOrgMSP" {
		return fmt.Errorf("only BankOrg can link certificates")
	}
	lot, err := c.getLot(ctx, lotID)
	if err != nil {
		return err
	}
	lot.CertificateNo = certificateNo
	lot.UpdatedAt     = time.Now().UTC().Format(time.RFC3339)
	lotJSON, _ := json.Marshal(lot)
	return ctx.GetStub().PutState(lotID, lotJSON)
}

// MarkExpired — System marks overdue lots as expired
func (c *AnnasetuContract) MarkExpired(
	ctx contractapi.TransactionContextInterface,
	lotID string,
) error {
	lot, err := c.getLot(ctx, lotID)
	if err != nil {
		return err
	}
	if lot.Status == StatusDelivered || lot.Status == StatusExpired || lot.Status == StatusCancelled {
		return fmt.Errorf("cannot expire lot in status %s", lot.Status)
	}
	mspID, _ := ctx.GetClientIdentity().GetMSPID()
	return c.updateLotStatus(ctx, lot, StatusExpired, "system", mspID, "auto-expired by cron")
}

// GetLot — Query a single lot
func (c *AnnasetuContract) GetLot(
	ctx contractapi.TransactionContextInterface, lotID string,
) (*DonationLot, error) {
	return c.getLot(ctx, lotID)
}

// GetLotHistory — Full audit trail via Fabric history API
func (c *AnnasetuContract) GetLotHistory(
	ctx contractapi.TransactionContextInterface, lotID string,
) ([]map[string]interface{}, error) {
	iter, err := ctx.GetStub().GetHistoryForKey(lotID)
	if err != nil {
		return nil, err
	}
	defer iter.Close()

	var history []map[string]interface{}
	for iter.HasNext() {
		mod, err := iter.Next()
		if err != nil {
			return nil, err
		}
		entry := map[string]interface{}{
			"txId":      mod.TxId,
			"timestamp": time.Unix(mod.Timestamp.Seconds, int64(mod.Timestamp.Nanos)).UTC().Format(time.RFC3339),
			"isDelete":  mod.IsDelete,
		}
		if !mod.IsDelete {
			var lot DonationLot
			json.Unmarshal(mod.Value, &lot)
			entry["lot"] = lot
		}
		history = append(history, entry)
	}
	return history, nil
}

// GetLotsByDonor — Rich query (requires CouchDB)
func (c *AnnasetuContract) GetLotsByDonor(
	ctx contractapi.TransactionContextInterface, donorID string,
) ([]*DonationLot, error) {
	query := fmt.Sprintf(`{"selector":{"docType":"DonationLot","donorId":"%s"},"sort":[{"createdAt":"desc"}]}`, donorID)
	return c.richQuery(ctx, query)
}

// GetLotsByStatus — Rich query
func (c *AnnasetuContract) GetLotsByStatus(
	ctx contractapi.TransactionContextInterface, status string,
) ([]*DonationLot, error) {
	query := fmt.Sprintf(`{"selector":{"docType":"DonationLot","status":"%s"}}`, status)
	return c.richQuery(ctx, query)
}

// GetDonorStats — Aggregate stats for a donor
func (c *AnnasetuContract) GetDonorStats(
	ctx contractapi.TransactionContextInterface, donorID string,
) (*DonorStats, error) {
	lots, err := c.GetLotsByDonor(ctx, donorID)
	if err != nil {
		return nil, err
	}

	stats := &DonorStats{DonorID: donorID, LastUpdated: time.Now().UTC().Format(time.RFC3339)}
	for _, l := range lots {
		stats.TotalLots++
		stats.TotalKg    += l.QuantityKg
		stats.TotalValue += l.EstimatedValue
		if l.Status == StatusDelivered { stats.DeliveredLots++ }
		if l.Status == StatusExpired   { stats.ExpiredLots++ }
	}
	return stats, nil
}

// ── Private helpers ───────────────────────────────────────────────────────────

func (c *AnnasetuContract) getLot(ctx contractapi.TransactionContextInterface, id string) (*DonationLot, error) {
	data, err := ctx.GetStub().GetState(id)
	if err != nil {
		return nil, fmt.Errorf("failed to read lot %s: %v", id, err)
	}
	if data == nil {
		return nil, fmt.Errorf("lot %s not found", id)
	}
	var lot DonationLot
	if err := json.Unmarshal(data, &lot); err != nil {
		return nil, err
	}
	return &lot, nil
}

func (c *AnnasetuContract) updateLotStatus(
	ctx contractapi.TransactionContextInterface,
	lot *DonationLot, newStatus DonationStatus,
	actor, org, reason string,
) error {
	now := time.Now().UTC().Format(time.RFC3339)
	lot.StatusHistory = append(lot.StatusHistory, StatusChange{
		From: lot.Status, To: newStatus,
		Actor: actor, Org: org, Reason: reason,
		Timestamp: now, TxID: ctx.GetStub().GetTxID(),
	})
	lot.Status    = newStatus
	lot.UpdatedAt = now
	lotJSON, err := json.Marshal(lot)
	if err != nil {
		return err
	}
	if err := ctx.GetStub().PutState(lot.ID, lotJSON); err != nil {
		return err
	}
	eventPayload, _ := json.Marshal(map[string]string{
		"lotId":  lot.ID,
		"status": string(newStatus),
		"actor":  actor,
	})
	return ctx.GetStub().SetEvent("StatusChanged", eventPayload)
}

func (c *AnnasetuContract) richQuery(ctx contractapi.TransactionContextInterface, query string) ([]*DonationLot, error) {
	iter, err := ctx.GetStub().GetQueryResult(query)
	if err != nil {
		return nil, err
	}
	defer iter.Close()
	var lots []*DonationLot
	for iter.HasNext() {
		qr, err := iter.Next()
		if err != nil {
			return nil, err
		}
		var lot DonationLot
		if err := json.Unmarshal(qr.Value, &lot); err != nil {
			return nil, err
		}
		lots = append(lots, &lot)
	}
	return lots, nil
}

func main() {
	cc, err := contractapi.NewChaincode(&AnnasetuContract{})
	if err != nil {
		panic(fmt.Sprintf("Failed to create chaincode: %v", err))
	}
	if err := cc.Start(); err != nil {
		panic(fmt.Sprintf("Failed to start chaincode: %v", err))
	}
}
