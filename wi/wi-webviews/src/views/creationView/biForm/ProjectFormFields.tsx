/**
 * Copyright (c) 2025, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { useEffect, useState, useRef, useMemo } from "react";
import debounce from "lodash/debounce";
import { TextField } from "@wso2/ui-toolkit";
import { DirectorySelector } from "../../../components/DirectorySelector/DirectorySelector";
import { useVisualizerContext } from "../../../contexts/WsContext";
import { useWorkspaceRoot } from "../../../providers";
import {
    FieldGroup,
    SectionDivider,
} from "./styles";
import { AdvancedConfigurationSection } from "./components";
import { Organization } from "./components/AdvancedConfigurationSection";
import { sanitizePackageName, validatePackageName, validateOrgName, joinPath, validateComponentName } from "./utils";
import { ProjectFormData } from "./types";
import { useRealtimeProjectPathValidation } from "./useRealtimeProjectPathValidation";

// Re-export for backwards compatibility
export type { ProjectFormData } from "./types";


export interface ProjectFormFieldsProps {
    formData: ProjectFormData;
    onFormDataChange: (data: Partial<ProjectFormData>) => void;
    integrationNameError?: string;
    pathError?: string;
    packageNameValidationError?: string;
    orgNameError?: string | null;
    expandAdvancedTrigger?: number;
    organizations?: Organization[];
    onHasErrors?: (hasErrors: boolean) => void;
}

export function ProjectFormFields({
    formData,
    onFormDataChange,
    integrationNameError,
    pathError,
    packageNameValidationError,
    orgNameError: orgNameErrorOverride,
    expandAdvancedTrigger,
    organizations,
    onHasErrors,
}: ProjectFormFieldsProps) {
    const { wsClient } = useVisualizerContext();
    const { path: workspacePath, isReady: workspaceReady } = useWorkspaceRoot();
    const [packageNameTouched, setPackageNameTouched] = useState(false);
    const [packageNameError, setPackageNameError] = useState<string | null>(null);
    const [integrationNameValidationError, setIntegrationNameValidationError] = useState<string | null>(null);
    const [pathValidationError, setPathValidationError] = useState<string | null>(null);
    const [orgNameError, setOrgNameError] = useState<string | null>(null);
    const [isPackageInfoExpanded, setIsPackageInfoExpanded] = useState(false);
    const [defaultPath, setDefaultPath] = useState("");
    const [pathTouched, setPathTouched] = useState(false);
    const [editablePath, setEditablePath] = useState("");
    const firstFieldRef = useRef<HTMLInputElement>(null);
    const orgNameInitialized = useRef(false);

    const debouncedSetIntegrationNameError = useMemo(
        () => debounce((error: string) => setIntegrationNameValidationError(error), 300),
        []
    );

    const resolvedPath = joinPath(editablePath, formData.packageName);

    useEffect(() => {
        if (!pathTouched) {
            setEditablePath(formData.path || defaultPath);
        }
    }, [formData.path, defaultPath, pathTouched]);

    const handleIntegrationName = (value: string) => {
        setPathTouched(false);
        const updates: Partial<ProjectFormData> = { integrationName: value };
        if (!packageNameTouched) {
            updates.packageName = sanitizePackageName(value);
        }
        onFormDataChange(updates);
    };

    const handleProjectDirSelection = async () => {
        try {
            const selectedDirectory = await wsClient.selectFileOrDirPath({ startPath: editablePath || formData.path || defaultPath });
            if (!selectedDirectory.path) return;
            setPathTouched(false);
            setEditablePath(selectedDirectory.path);
            onFormDataChange({ path: selectedDirectory.path });
        } catch (error) {
            console.error("Failed to select directory:", error);
        }
    };

    useEffect(() => {
        if (!workspaceReady) return;
        (async () => {
            if (!formData.path) {
                try {
                    const dp = workspacePath || (await wsClient.getDefaultCreationPath()).path;
                    setDefaultPath(dp);
                    onFormDataChange({ path: dp });
                } catch (error) {
                    console.error("Failed to fetch default creation path:", error);
                    if (workspacePath) {
                        setDefaultPath(workspacePath);
                        onFormDataChange({ path: workspacePath });
                    }
                }
            }
            if (!orgNameInitialized.current) {
                orgNameInitialized.current = true;
                if (organizations && organizations.length > 0) {
                    onFormDataChange({ orgName: organizations[0].handle });
                } else {
                    try {
                        const { orgName } = await wsClient.getDefaultOrgName();
                        onFormDataChange({ orgName });
                    } catch (error) {
                        console.error("Failed to fetch default org name:", error);
                    }
                }
            }
        })();
    }, [workspaceReady, wsClient, workspacePath, formData.path, formData.packageName, onFormDataChange, organizations]);

    useEffect(() => {
        const error = validatePackageName(formData.packageName, formData.integrationName);
        setPackageNameError(error);
    }, [formData.packageName, formData.integrationName]);

    // Real-time integration name validation — clear immediately when valid, debounce new errors.
    useEffect(() => {
        const error = validateComponentName(formData.integrationName);
        if (!error) {
            debouncedSetIntegrationNameError.cancel();
            setIntegrationNameValidationError(null);
            return;
        }
        debouncedSetIntegrationNameError(error);
        return () => debouncedSetIntegrationNameError.cancel();
    }, [formData.integrationName]);

    useRealtimeProjectPathValidation({
        wsClient,
        projectPath: editablePath,
        projectName: formData.packageName,
        createAsWorkspace: false,
        pathTouched,
        requiredPathMessage: "Please select a path",
        invalidPathMessage: "Invalid integration path",
        onPathErrorChange: setPathValidationError,
    });

    useEffect(() => {
        if (expandAdvancedTrigger) {
            setIsPackageInfoExpanded(true);
        }
    }, [expandAdvancedTrigger]);

    // Validation effect for org name.
    useEffect(() => {
        // If the parent provided an explicit org name error, show it immediately.
        // Otherwise, validate locally as the user edits.
        if (orgNameErrorOverride !== undefined) {
            setOrgNameError(orgNameErrorOverride);
            return;
        }
        setOrgNameError(validateOrgName(formData.orgName));
    }, [formData.orgName, orgNameErrorOverride]);

    // Propagate aggregated error state to the parent so it can disable its submit button.
    useEffect(() => {
        const hasAnyError = !!(
            integrationNameError ||
            integrationNameValidationError ||
            pathError ||
            pathValidationError ||
            packageNameValidationError ||
            packageNameError ||
            orgNameError
        );
        onHasErrors?.(hasAnyError);
    }, [
        integrationNameError,
        integrationNameValidationError,
        pathError,
        pathValidationError,
        packageNameValidationError,
        packageNameError,
        orgNameError,
    ]);

    // Focus and select the first field on mount — VSCodeTextField is a web component,
    // so the real <input> is inside its shadow DOM and needs to be targeted directly.
    useEffect(() => {
        setTimeout(() => {
            const inner = (firstFieldRef.current as any)?.shadowRoot?.querySelector("input") as HTMLInputElement | null;
            inner?.focus();
            inner?.select();
        }, 0);
    }, []);

    return (
        <>
            {/* Primary Fields - Always Visible */}
            <FieldGroup>
                <TextField
                    ref={firstFieldRef}
                    onTextChange={handleIntegrationName}
                    value={formData.integrationName}
                    label={`Integration Name`}
                    placeholder={`Enter an integration name`}
                    required={true}
                    errorMsg={integrationNameError || integrationNameValidationError || ""}
                />
            </FieldGroup>

            <FieldGroup>
                <DirectorySelector
                    id="project-folder-selector"
                    label="Select Path"
                    placeholder="Browse to select a folder..."
                    selectedPath={resolvedPath}
                    required={true}
                    onSelect={handleProjectDirSelection}
                    onChange={(value) => {
                        setPathTouched(true);
                        const lastSep = Math.max(value.lastIndexOf('/'), value.lastIndexOf('\\'));
                        if (lastSep > 0) {
                            const parentDir = value.substring(0, lastSep);
                            const lastName = value.substring(lastSep + 1);
                            setEditablePath(parentDir);
                            const updates: Partial<ProjectFormData> = { path: parentDir };
                            if (lastName) {
                                updates.packageName = lastName;
                                setPackageNameTouched(true);
                            }
                            onFormDataChange(updates);
                        } else {
                            setEditablePath(value);
                            onFormDataChange({ path: value });
                        }
                    }}
                    errorMsg={pathError || pathValidationError || undefined}
                />
            </FieldGroup>

            <SectionDivider />

            <AdvancedConfigurationSection
                isExpanded={isPackageInfoExpanded}
                onToggle={() => setIsPackageInfoExpanded(!isPackageInfoExpanded)}
                data={{
                    packageName: formData.packageName,
                    orgName: formData.orgName,
                    version: formData.version,
                }}
                onChange={(data) => {
                    if (data.packageName !== undefined) {
                        setPackageNameTouched(data.packageName.length > 0);
                        if (packageNameError) setPackageNameError(null);
                        setPathTouched(false);
                    }
                    onFormDataChange(data);
                }}
                orgNameError={orgNameError}
                packageNameError={packageNameValidationError || packageNameError}
                organizations={organizations}
                hasError={!!(packageNameValidationError || packageNameError || orgNameError)}
            />
        </>
    );
}
