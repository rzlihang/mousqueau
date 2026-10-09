package keychain

import (
	"context"
	"errors"
	"fmt"
	"unsafe"

	"golang.org/x/sys/windows"
)

// Windows keeps the key as a generic credential in Credential Manager.
var (
	advapi32        = windows.NewLazySystemDLL("advapi32.dll")
	procCredReadW   = advapi32.NewProc("CredReadW")
	procCredWriteW  = advapi32.NewProc("CredWriteW")
	procCredDeleteW = advapi32.NewProc("CredDeleteW")
	procCredFree    = advapi32.NewProc("CredFree")
)

const (
	target                  = service + "/" + account
	credTypeGeneric         = 1
	credPersistLocalMachine = 2
)

// credential mirrors CREDENTIALW.
type credential struct {
	Flags              uint32
	Type               uint32
	TargetName         *uint16
	Comment            *uint16
	LastWritten        windows.Filetime
	CredentialBlobSize uint32
	CredentialBlob     *byte
	Persist            uint32
	AttributeCount     uint32
	Attributes         uintptr
	TargetAlias        *uint16
	UserName           *uint16
}

func Available() bool { return procCredReadW.Find() == nil }

// Get returns "" when no key has been stored.
func Get(ctx context.Context) (string, error) {
	if err := ctx.Err(); err != nil {
		return "", err
	}
	name, err := windows.UTF16PtrFromString(target)
	if err != nil {
		return "", err
	}
	var cred *credential
	ok, _, err := procCredReadW.Call(uintptr(unsafe.Pointer(name)), credTypeGeneric, 0, uintptr(unsafe.Pointer(&cred)))
	if ok == 0 {
		if errors.Is(err, windows.ERROR_NOT_FOUND) {
			return "", nil
		}
		return "", fmt.Errorf("cannot read Windows Credential Manager")
	}
	defer procCredFree.Call(uintptr(unsafe.Pointer(cred)))
	if cred.CredentialBlobSize == 0 {
		return "", nil
	}
	return string(unsafe.Slice(cred.CredentialBlob, cred.CredentialBlobSize)), nil
}

// Set stores or replaces the key.
func Set(ctx context.Context, key string) error {
	if err := Validate(key); err != nil {
		return err
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	name, err := windows.UTF16PtrFromString(target)
	if err != nil {
		return err
	}
	user, err := windows.UTF16PtrFromString(account)
	if err != nil {
		return err
	}
	blob := []byte(key)
	cred := credential{
		Type: credTypeGeneric, TargetName: name, UserName: user, Persist: credPersistLocalMachine,
		CredentialBlobSize: uint32(len(blob)), CredentialBlob: &blob[0],
	}
	if ok, _, _ := procCredWriteW.Call(uintptr(unsafe.Pointer(&cred)), 0); ok == 0 {
		return fmt.Errorf("cannot save to Windows Credential Manager")
	}
	return nil
}

func Delete(ctx context.Context) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	name, err := windows.UTF16PtrFromString(target)
	if err != nil {
		return err
	}
	ok, _, err := procCredDeleteW.Call(uintptr(unsafe.Pointer(name)), credTypeGeneric, 0)
	if ok == 0 && !errors.Is(err, windows.ERROR_NOT_FOUND) {
		return fmt.Errorf("cannot remove the key from Windows Credential Manager")
	}
	return nil
}
