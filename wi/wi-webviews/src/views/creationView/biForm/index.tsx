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

import { useState } from "react";
import { Button } from "@wso2/ui-toolkit";
import { useVisualizerContext } from "../../../contexts";
import {
    FormContainer,
    ButtonWrapper
} from "./styles";
import { ProjectFormFields } from "./ProjectFormFields";
import { DEFAULT_INTEGRATION_NAME, ProjectFormData } from "./types";
import {
    sanitizeOrgHandle,
    validateComponentName,
    validateOrgName,
    validatePackageName,
} from "./utils";
import { ValidateProjectFormErrorField } from "@wso2/wi-core";
import { useCloudContext } from "../../../providers";

export function BIProjectForm({ ballerinaUnavailable }: { ballerinaUnavailable?: boolean }) {
    const { wsClient } = useVisualizerContext();
    const { authState } = useCloudContext();
    const organizations = (authState?.userInfo?.organizations as Array<{ id?: any; handle: string; name: string }> | undefined);
    const [formData, setFormData] = useState<ProjectFormData>({
        integrationName: DEFAULT_INTEGRATION_NAME,
        packageName: "untitled",
        path: "",
        createAsWorkspace: false,
        workspaceName: "",
        createWithinProject: false,
        withinProjectName: "",
        projectHandle: "",
        orgName: "",
        version: "",
        isLibrary: false,
    });
    const [isValidating, setIsValidating] = useState(false);
    const [integrationNameError, setIntegrationNameError] = useState<string | null>(null);
    const [pathError, setPathError] = useState<string | null>(null);
    const [packageNameValidationError, setPackageNameValidationError] = useState<string | null>(null);
    const [childHasErrors, setChildHasErrors] = useState(false);
    const [expandAdvancedTrigger, setExpandAdvancedTrigger] = useState(0);
    const createActionLabel = "Create Integration";

    const handleFormDataChange = (data: Partial<ProjectFormData>) => {
        setFormData(prev => ({ ...prev, ...data }));
        if (integrationNameError) setIntegrationNameError(null);
        if (pathError) setPathError(null);
        if (packageNameValidationError) setPackageNameValidationError(null);
    };

    const handleCreateProject = async () => {
        setIsValidating(true);
        setIntegrationNameError(null);
        setPathError(null);
        setPackageNameValidationError(null);

        let hasError = false;

        const integrationNameErr = validateComponentName(formData.integrationName);
        if (integrationNameErr) {
            setIntegrationNameError(integrationNameErr);
            hasError = true;
        }

        if (formData.packageName.length < 2) {
            setPackageNameValidationError("Package name must be at least 2 characters");
            setExpandAdvancedTrigger(t => t + 1);
            hasError = true;
        } else {
            const packageNameError = validatePackageName(formData.packageName, formData.integrationName);
            if (packageNameError) {
                setPackageNameValidationError(packageNameError);
                setExpandAdvancedTrigger(t => t + 1);
                hasError = true;
            }
        }

        const orgErr = validateOrgName(formData.orgName);
        if (orgErr) {
            setExpandAdvancedTrigger(t => t + 1);
            hasError = true;
        }

        if (formData.path.length < 2) {
            setPathError("Please select a path for your integration");
            hasError = true;
        }

        if (hasError) {
            setIsValidating(false);
            return;
        }

        try {
            const validationResult = await wsClient.validateProjectPath({
                projectPath: formData.path,
                projectName: formData.packageName,
                createDirectory: true,
                createAsWorkspace: false,
            });

            if (!validationResult.isValid) {
                if (validationResult.errorField === ValidateProjectFormErrorField.PATH) {
                    setPathError(validationResult.errorMessage || "Invalid integration path");
                } else if (validationResult.errorField === ValidateProjectFormErrorField.NAME) {
                    setPathError(validationResult.errorMessage || "Invalid integration name");
                }
                setIsValidating(false);
                return;
            }

            const orgHandle = organizations?.find(o => o.handle === formData.orgName)?.handle ||
                sanitizeOrgHandle(formData.orgName);

            await wsClient.createBIProject({
                projectName: formData.integrationName.trim(),
                packageName: formData.packageName,
                projectPath: formData.path,
                createDirectory: true,
                createAsWorkspace: false,
                orgName: formData.orgName || undefined,
                orgHandle,
                version: formData.version || undefined,
            });
        } catch (error) {
            setPathError("An error occurred during validation");
        } finally {
            setIsValidating(false);
        }
    };

    return (
        <FormContainer>
            <ProjectFormFields
                formData={formData}
                onFormDataChange={handleFormDataChange}
                integrationNameError={integrationNameError || undefined}
                pathError={pathError || undefined}
                packageNameValidationError={packageNameValidationError || undefined}
                expandAdvancedTrigger={expandAdvancedTrigger}
                organizations={organizations}
                onHasErrors={setChildHasErrors}
            />

            <ButtonWrapper>
                <span title={ballerinaUnavailable ? "Ballerina distribution is not set up. Use Configure to set it up." : undefined}>
                    <Button
                        disabled={isValidating || ballerinaUnavailable || childHasErrors}
                        onClick={handleCreateProject}
                        appearance="primary"
                    >
                        {isValidating ? "Validating..." : createActionLabel}
                    </Button>
                </span>
            </ButtonWrapper>
        </FormContainer>
    );
}
